/**
 * LangGraph-based Conversation Pipeline — Optimized for low latency
 *
 * OLD flow (sequential ~10s):
 *   detect(4s) → decide(1.75s) → loadHistory → generate(2.2s) → guardrails → scoring → tts(2s)
 *
 * NEW flow (parallel ~4-5s):
 *   START → parallelPrepare (DecisionEngine + RAG + History all at once, ~4s)
 *         → generate(2.2s, uses all context)
 *         → guardrails+scoring (instant, rule-based)
 *         → tts(2s)
 *
 * Key changes:
 *  - DecisionEngine + RAG + Redis history run in Promise.all (parallel)
 *  - Filler audio fires at 300ms (was 500ms)
 *  - Input guardrails merged into parallelPrepare (rule-based, instant)
 *  - No separate loadHistory node
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { LeadProfile } from './startingScript';
import { detectLanguage, streamSimpleReply } from '../llm/llmService';
import { streamSentences, SarvamLanguage, detectTTSLanguage } from '../tts/sarvamTTS';
import { retrieveRelevantChunks } from '../rag/ragService';
import { checkInputRelevance } from '../guardrails/guardrailsService';
import { getHistory, appendMessage } from '../memory/sessionStore';
import { runDecisionEngine, CallStage, ObjectionType, DecisionResult, fallbackClassify } from './decisionEngine';
import { buildPrompt } from './promptBuilder';
import { computeScore, ConversationSignals, TurnSignals } from '../scoring/scoringEngine';

// ── State ────────────────────────────────────────────────────────────────────

const ConversationStateAnnotation = Annotation.Root({
  lead_id: Annotation<string>,
  conversation_id: Annotation<string>,
  call_stage: Annotation<CallStage>,
  stage: Annotation<'opening' | 'conversation' | 'objection' | 'closing' | 'ended'>,
  intent: Annotation<string | undefined>,
  emotion: Annotation<'positive' | 'neutral' | 'negative' | 'confused' | undefined>,
  is_objection: Annotation<boolean>,
  active_objection: Annotation<ObjectionType>,
  objections_raised: Annotation<ObjectionType[]>,
  objections_resolved: Annotation<ObjectionType[]>,
  turn_signals: Annotation<TurnSignals[]>,
  use_cache: Annotation<boolean>,
  use_rag: Annotation<boolean>,
  use_web: Annotation<boolean>,
  input_blocked: Annotation<boolean>,
  user_input: Annotation<string | undefined>,
  detected_language: Annotation<'hindi' | 'hinglish' | 'english'>,
  history: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>,
  response: Annotation<string>,
  audio_chunks: Annotation<Buffer[] | undefined>,
  rag_context: Annotation<string[] | undefined>,
  score: Annotation<number>,
  engagement_level: Annotation<'high' | 'medium' | 'low'>,
  handoff: Annotation<boolean>,
  should_continue: Annotation<boolean>,
  end_reason: Annotation<string | undefined>,
  lead_profile: Annotation<LeadProfile | undefined>,
  turn_count: Annotation<number>,
  start_time: Annotation<number>,
  last_activity: Annotation<number>,
  error: Annotation<string | undefined>,
});

export type ConversationState = typeof ConversationStateAnnotation.State;

// ── Helpers ───────────────────────────────────────────────────────────────────

function callStageToLegacy(stage: CallStage): ConversationState['stage'] {
  switch (stage) {
    case 'greeting':           return 'opening';
    case 'pitch':              return 'conversation';
    case 'objection_handling': return 'objection';
    case 'qualification':      return 'conversation';
    case 'closing':            return 'closing';
    case 'ended':              return 'ended';
    default:                   return 'conversation';
  }
}

function needsRag(state: ConversationState): boolean {
  return (
    state.call_stage === 'objection_handling' ||
    state.call_stage === 'pitch' ||
    state.call_stage === 'qualification' ||
    state.is_objection
  );
}

// ── NODE 1: OPENING ───────────────────────────────────────────────────────────

async function openingNode(state: ConversationState): Promise<Partial<ConversationState>> {
  console.log('[Graph] Opening node');

  // Build a warm 2-step greeting:
  // Step 1: Namaste + introduce yourself
  // Step 2: Ask one soft question to get them talking before pitching
  const name = state.lead_profile?.name;
  const occupation = state.lead_profile?.occupation?.toLowerCase() || '';
  const lang = state.lead_profile?.language || 'hinglish';

  let greeting: string;

  if (lang === 'english') {
    greeting = name
      ? `Hi ${name}! This is Priya calling from Rupeezy. Hope I'm not catching you at a bad time — do you have 2 minutes?`
      : `Hi! This is Priya calling from Rupeezy. Hope I'm not catching you at a bad time — do you have 2 minutes?`;
  } else if (lang === 'hindi') {
    greeting = name
      ? `नमस्ते ${name} जी! मैं Priya बोल रही हूँ Rupeezy से। क्या अभी 2 minute बात हो सकती है?`
      : `नमस्ते! मैं Priya बोल रही हूँ Rupeezy से। क्या अभी 2 minute बात हो सकती है?`;
  } else {
    // Hinglish — default
    if (occupation.includes('mfd') || occupation.includes('distributor')) {
      greeting = name
        ? `Namaste ${name} ji! Main Priya bol rahi hoon Rupeezy se. Aap distribution mein hain — kya abhi 2 minute baat ho sakti hai?`
        : `Namaste! Main Priya bol rahi hoon Rupeezy se. Kya abhi 2 minute baat ho sakti hai?`;
    } else if (occupation.includes('insurance')) {
      greeting = name
        ? `Namaste ${name} ji! Main Priya hoon Rupeezy se. Aap insurance mein hain — kya abhi thodi baat ho sakti hai?`
        : `Namaste! Main Priya hoon Rupeezy se. Kya abhi thodi baat ho sakti hai?`;
    } else {
      greeting = name
        ? `Namaste ${name} ji! Main Priya bol rahi hoon Rupeezy ki taraf se. Kya abhi 2 minute baat ho sakti hai?`
        : `Namaste! Main Priya bol rahi hoon Rupeezy ki taraf se. Kya abhi 2 minute baat ho sakti hai?`;
    }
  }

  return {
    stage: 'conversation',
    call_stage: 'greeting',  // stay in greeting — move to pitch after first response
    response: greeting,
    history: [{ role: 'assistant', content: greeting }],
    detected_language: lang as 'hindi' | 'hinglish' | 'english',
    score: 0,
    engagement_level: 'medium',
    last_activity: Date.now(),
  };
}

// ── NODE 2: PARALLEL PREPARE ──────────────────────────────────────────────────
// Runs DecisionEngine + RAG + Redis history all at once.
// This is the key optimization — was 3 sequential nodes (~7s), now 1 parallel node (~4s).

async function parallelPrepareNode(state: ConversationState): Promise<Partial<ConversationState>> {
  console.log('[Graph] ParallelPrepare - running DecisionEngine + RAG + History in parallel');

  if (!state.user_input) {
    return { intent: 'unknown', emotion: 'neutral', is_objection: false, input_blocked: false };
  }

  const detected_language = detectLanguage(state.user_input);
  const t = Date.now();

  // ── Input guardrail (instant, rule-based) ──
  const isRelevant = await checkInputRelevance(state.user_input);
  if (!isRelevant) {
    const blockResponse = detected_language === 'english'
      ? 'I can only help with questions about Rupeezy and financial services.'
      : 'Main sirf Rupeezy aur financial services ke baare mein help kar sakti hoon.';
    return {
      input_blocked: true,
      response: blockResponse,
      detected_language,
    };
  }

  // ── Run all 3 async tasks in parallel ──
  const ragQuery = state.active_objection && state.active_objection !== 'none'
    ? `${state.user_input} ${state.active_objection.replace(/_/g, ' ')}`
    : state.user_input;

  const shouldFetchRag = needsRag(state) || state.is_objection;

  const [decisionResult, ragChunks, redisHistory] = await Promise.all([
    // Task 1: LLM classification — skip for very short inputs (saves ~2s)
    (state.user_input && state.user_input.trim().split(/\s+/).length <= 4)
      ? Promise.resolve({
          ...fallbackClassify(state.user_input),
          // Advance from greeting to pitch after first response
          next_stage: (state.call_stage === 'greeting' ? 'pitch' : state.call_stage) as CallStage,
          should_handoff: false,
          should_end: false,
          reason: undefined as string | undefined,
        })
      : runDecisionEngine(
          state.user_input,
          state.history,
          state.call_stage,
          state.turn_count,
          state.objections_raised.length,
        ).catch((err) => {
          console.error('[Graph] DecisionEngine failed, using keyword fallback:', err.message);
          const fb = fallbackClassify(state.user_input!);
          return {
            ...fb,
            next_stage: state.call_stage,
            should_handoff: false,
            should_end: false,
            reason: undefined as string | undefined,
          };
        }),

    // Task 2: RAG retrieval (~1.75s) — runs in parallel with DecisionEngine
    shouldFetchRag
      ? retrieveRelevantChunks(ragQuery, 2).catch(() => [] as string[])
      : Promise.resolve([] as string[]),

    // Task 3: Redis history fetch (~50ms) — runs in parallel
    getHistory(state.conversation_id).catch(() => state.history),
  ]);

  console.log(`[Graph] ParallelPrepare done in ${Date.now() - t}ms | objection: ${decisionResult.objection} | rag: ${ragChunks.length} chunks`);

  // Track objections
  const objections_raised = [...state.objections_raised];
  if (decisionResult.is_objection && decisionResult.objection !== 'none' && !objections_raised.includes(decisionResult.objection)) {
    objections_raised.push(decisionResult.objection);
  }

  // Convert Redis history
  const history = redisHistory.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return {
    input_blocked: false,
    detected_language,
    intent: decisionResult.intent,
    emotion: decisionResult.emotion,
    is_objection: decisionResult.is_objection,
    active_objection: decisionResult.objection,
    objections_raised,
    call_stage: decisionResult.next_stage,
    stage: callStageToLegacy(decisionResult.next_stage),
    handoff: decisionResult.should_handoff,
    should_continue: !decisionResult.should_end,
    end_reason: decisionResult.reason,
    rag_context: ragChunks,
    history,
    last_activity: Date.now(),
  };
}

// ── NODE 3: GENERATE ──────────────────────────────────────────────────────────

async function generateNode(state: ConversationState): Promise<Partial<ConversationState>> {
  console.log('[Graph] Generate node | stage:', state.call_stage, '| lang:', state.detected_language, '| objection:', state.active_objection);

  if (!state.user_input) {
    return { response: 'Kya aap thoda aur bata sakte hain?' };
  }

  const systemPrompt = buildPrompt({
    stage: state.call_stage,
    language: state.detected_language,
    leadProfile: state.lead_profile,
    activeObjection: state.active_objection,
    objectionsRaised: state.objections_raised,
    objectionsResolved: state.objections_resolved,
    runningScore: state.score,
    turnCount: state.turn_count,
    ragChunks: state.rag_context,
  });

  // Build conversation context for the LLM (last 4 turns = 8 messages)
  const historyContext = state.history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Lead' : 'Priya'}: ${m.content}`)
    .join('\n');

  const fullInput = historyContext
    ? `${historyContext}\nLead: ${state.user_input}`
    : state.user_input;

  try {
    const tokenStream = streamSimpleReply(fullInput, systemPrompt);
    let response = '';
    for await (const token of tokenStream) {
      response += token;
    }

    // Strip <think> blocks
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Contextual fallback if empty
    if (!response.trim()) {
      const lang = state.detected_language;
      if (state.call_stage === 'objection_handling' && state.active_objection !== 'none') {
        response = lang === 'english'
          ? 'I understand your concern. Let me address that.'
          : 'Bilkul samajh aata hai. Main aapki baat ka jawab deta hoon.';
      } else if (state.call_stage === 'pitch') {
        response = lang === 'english'
          ? 'Rupeezy offers 100% brokerage share with daily payouts and zero joining fee.'
          : 'Rupeezy mein 100% brokerage share milta hai, daily payout ke saath, aur joining fee bilkul nahi.';
      } else {
        response = lang === 'english' ? 'Could you tell me more?' : 'Kya aap thoda aur bata sakte hain?';
      }
      console.log('[Graph] Used contextual fallback');
    }

    console.log('[Graph] Response:', response.substring(0, 100));

    // Persist to Redis (fire and forget — don't block response)
    appendMessage(state.conversation_id, 'user', state.user_input).catch(() => {});
    appendMessage(state.conversation_id, 'assistant', response).catch(() => {});

    const updated_history = [
      ...state.history,
      { role: 'user' as const, content: state.user_input },
      { role: 'assistant' as const, content: response },
    ];

    return {
      response,
      history: updated_history,
      turn_count: state.turn_count + 1,
      last_activity: Date.now(),
    };
  } catch (err: any) {
    console.error('[Graph] Generate error:', err);
    return {
      response: state.detected_language === 'english'
        ? 'Could you please repeat that?'
        : 'Kya aap phir se bol sakte hain?',
      error: err.message,
    };
  }
}

// ── NODE 4: GUARDRAILS + SCORING (merged, instant) ────────────────────────────

const COMPLIANCE_REPLACEMENTS: [RegExp, string][] = [
  [/\bguarantee[d]?\b/gi, 'aim to provide'],
  [/\b100%\s*sure\b/gi, 'confident'],
  [/\bzero[\s-]risk\b/gi, 'managed risk'],
  [/\brisk[\s-]free\b/gi, 'managed risk'],
  [/\bpromise\b/gi, 'strive to'],
];

async function guardrailsScoringNode(state: ConversationState): Promise<Partial<ConversationState>> {
  // ── Guardrails (rule-based) ──
  let response = state.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const words = response.split(/\s+/);
  if (words.length > 80) {
    response = response.split(/(?<=[.!?।])\s+/).slice(0, 3).join(' ');
  }
  for (const [pattern, replacement] of COMPLIANCE_REPLACEMENTS) {
    response = response.replace(pattern, replacement);
  }
  if (!response.trim()) {
    response = state.detected_language === 'english' ? 'Could you tell me more?' : 'Kya aap thoda aur bata sakte hain?';
  }

  // ── Scoring (derived from DecisionEngine, no LLM) ──
  const newSignal: TurnSignals = {
    enthusiasm:
      state.intent === 'positive_interest' ? 8 :
      state.emotion === 'positive' ? 6 :
      state.intent === 'information_request' ? 5 :
      state.emotion === 'negative' ? 1 :
      state.emotion === 'confused' ? 2 : 3,
    asked_followup: state.intent === 'information_request',
    positive_affirmation: state.emotion === 'positive',
    objection_raised: state.is_objection,
    objection_resolved: state.is_objection && state.call_stage !== 'objection_handling' && state.objections_raised.length > 0,
    stated_intent: state.intent === 'positive_interest',
  };

  const turn_signals: TurnSignals[] = [...(state.turn_signals || []), newSignal];
  const durationSeconds = Math.floor((Date.now() - state.start_time) / 1000);
  const breakdown = computeScore({
    turns: turn_signals,
    callDurationSeconds: durationSeconds,
    medianCallDurationSeconds: 120,
    stayedThroughPitch: state.turn_count >= 3,
  } as ConversationSignals);

  const engagement_level: 'high' | 'medium' | 'low' =
    breakdown.status === 'HOT' ? 'high' :
    breakdown.status === 'WARM' ? 'medium' : 'low';

  // ── Decision ──
  // Only end/handoff based on very clear signals — don't end prematurely
  let { handoff, should_continue, end_reason, call_stage } = state;

  // HOT: score ≥ 75 AND lead explicitly stated intent AND at least 5 turns
  if (!handoff && breakdown.total >= 75 && state.turn_count >= 5 && newSignal.stated_intent) {
    handoff = true; should_continue = false; end_reason = 'score_threshold_hot'; call_stage = 'closing';
  }

  // COLD: very low score + negative emotion after many turns
  if (!handoff && breakdown.total < 10 && state.emotion === 'negative' && state.turn_count >= 6) {
    should_continue = false; end_reason = 'low_score_negative'; call_stage = 'ended';
  }

  // Max turns safety valve
  if (!handoff && state.turn_count >= 20) {
    handoff = true; should_continue = false; end_reason = 'max_turns_reached'; call_stage = 'closing';
  }

  // IMPORTANT: Never end call just because DecisionEngine said so from prepResult
  // The handler checks should_continue — keep it true unless we explicitly set it above
  if (should_continue === false && !end_reason) {
    should_continue = true; // reset spurious ends
  }

  console.log(`[Graph] Score: ${breakdown.total} (${breakdown.status}) | handoff: ${handoff}`);

  return {
    response,
    score: breakdown.total,
    engagement_level,
    turn_signals,
    handoff,
    should_continue,
    end_reason,
    call_stage,
    stage: callStageToLegacy(call_stage),
  };
}

// ── NODE 5: TTS ───────────────────────────────────────────────────────────────
// Uses detectTTSLanguage to avoid Sarvam 422 errors on pure-English responses

async function ttsNode(state: ConversationState): Promise<Partial<ConversationState>> {
  if (!state.response) return { audio_chunks: undefined };

  try {
    // Auto-detect actual TTS language from response content
    const preferredLang: SarvamLanguage = state.detected_language === 'english' ? 'en-IN' : 'hi-IN';
    const ttsLang = detectTTSLanguage(state.response, preferredLang);

    const audioChunks: Buffer[] = [];

    async function* textStream() { yield state.response; }

    for await (const chunk of streamSentences(textStream(), ttsLang)) {
      audioChunks.push(chunk);
    }

    console.log('[Graph] TTS generated', audioChunks.length, 'chunks | lang:', ttsLang);
    return { audio_chunks: audioChunks };
  } catch (err: any) {
    console.error('[Graph] TTS error:', err);
    return { audio_chunks: undefined, error: err.message };
  }
}

// ── GRAPH CONSTRUCTION ────────────────────────────────────────────────────────
// Two graphs:
// 1. Full graph (opening only) — opening → tts
// 2. Prep-only graph — parallelPrepare → END (no generate/tts, handler does those)

function routeFromStart(state: ConversationState): string {
  return state.stage === 'opening' ? 'opening' : 'parallelPrepare';
}

function routeAfterPrepare(state: ConversationState): string {
  return state.input_blocked ? 'tts' : 'generate';
}

/** Full graph — used for opening greeting only */
export function buildConversationGraph() {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('opening', openingNode)
    .addNode('parallelPrepare', parallelPrepareNode)
    .addNode('generate', generateNode)
    .addNode('guardrailsScoring', guardrailsScoringNode)
    .addNode('tts', ttsNode)

    .addConditionalEdges(START, routeFromStart, {
      opening: 'opening',
      parallelPrepare: 'parallelPrepare',
    })
    .addEdge('opening', 'tts')
    .addConditionalEdges('parallelPrepare', routeAfterPrepare, {
      generate: 'generate',
      tts: 'tts',
    })
    .addEdge('generate', 'guardrailsScoring')
    .addEdge('guardrailsScoring', 'tts')
    .addEdge('tts', END);

  return workflow.compile();
}

/** Prep-only graph — runs parallelPrepare and stops. Handler does generate+TTS for streaming. */
export function buildPrepGraph() {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('parallelPrepare', parallelPrepareNode)
    .addEdge(START, 'parallelPrepare')
    .addEdge('parallelPrepare', END);

  return workflow.compile();
}

// ── State factory ─────────────────────────────────────────────────────────────

export function createConversationState(
  lead_id: string,
  conversation_id: string,
  lead_profile?: LeadProfile,
): ConversationState {
  return {
    lead_id,
    conversation_id,
    call_stage: 'greeting',
    stage: 'opening',
    intent: undefined,
    emotion: undefined,
    is_objection: false,
    active_objection: 'none' as ObjectionType,
    objections_raised: [],
    objections_resolved: [],
    turn_signals: [],
    use_cache: false,
    use_rag: false,
    use_web: false,
    input_blocked: false,
    user_input: undefined,
    detected_language: lead_profile?.language || 'hinglish',
    history: [],
    response: '',
    audio_chunks: undefined,
    rag_context: undefined,
    score: 0,
    engagement_level: 'medium',
    handoff: false,
    should_continue: true,
    end_reason: undefined,
    lead_profile,
    turn_count: 0,
    start_time: Date.now(),
    last_activity: Date.now(),
    error: undefined,
  };
}

export async function processUserTurn(
  graph: ReturnType<typeof buildConversationGraph>,
  currentState: ConversationState,
  userInput: string,
): Promise<ConversationState> {
  const result = await graph.invoke(
    { ...currentState, user_input: userInput },
    { recursionLimit: 10 },
  );
  return result as ConversationState;
}
