/**
 * Decision Engine
 *
 * Responsibilities:
 *  1. Classify the 5 core objections via LLM (fast model, JSON output)
 *  2. Run the stage machine — advance stage based on conversation signals
 *  3. Detect intent signals (stated_intent, positive_affirmation, etc.)
 *  4. Return a structured DecisionResult consumed by the graph
 *
 * Designed to be fast: uses MODEL_FAST, fires in parallel where possible.
 */

import { Ollama } from 'ollama';
import dotenv from 'dotenv';

dotenv.config();

const ollama = new Ollama({ host: process.env.OLLAMA_BASE_URL });
const MODEL_FAST = process.env.OLLAMA_MODEL_FAST || 'gpt-oss:120b-cloud';

const VALID_OBJECTIONS: ObjectionType[] = [
  'already_with_broker',
  'not_enough_contacts',
  'client_support_concern',
  'trust_concern',
  'defer_decision',
  'none',
];
const VALID_EMOTIONS: EmotionType[] = ['positive', 'neutral', 'negative', 'confused'];

// ── Types ────────────────────────────────────────────────────────────────────

export type CallStage =
  | 'greeting'
  | 'pitch'
  | 'objection_handling'
  | 'qualification'
  | 'closing'
  | 'ended';

export type ObjectionType =
  | 'already_with_broker'
  | 'not_enough_contacts'
  | 'client_support_concern'
  | 'trust_concern'
  | 'defer_decision'
  | 'none';

export type EmotionType = 'positive' | 'neutral' | 'negative' | 'confused';

export interface DetectionResult {
  /** One of the 5 core objections, or 'none' */
  objection: ObjectionType;
  /** Whether this turn contains an objection */
  is_objection: boolean;
  /** Detected emotion */
  emotion: EmotionType;
  /** High-level intent label */
  intent: string;
  /** Lead explicitly asked for sign-up link / how to join */
  stated_intent: boolean;
  /** Lead gave positive affirmation (haan, yes, sounds good, bilkul) */
  positive_affirmation: boolean;
  /** Lead asked a follow-up question about the program */
  asked_followup: boolean;
  /** Enthusiasm 0–10 */
  enthusiasm: number;
}

export interface StageTransition {
  /** New stage after this turn */
  next_stage: CallStage;
  /** Whether to trigger RM handoff */
  should_handoff: boolean;
  /** Whether to end the call without handoff */
  should_end: boolean;
  /** Reason string for logging / summary */
  reason?: string;
}

export interface DecisionResult extends DetectionResult, StageTransition {}

function extractJsonObject(raw: string): string | null {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!cleaned) return null;

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  return cleaned.slice(start, end + 1);
}

function sanitizeDetection(parsed: Partial<DetectionResult>): DetectionResult {
  const objection = VALID_OBJECTIONS.includes(parsed.objection as ObjectionType)
    ? parsed.objection as ObjectionType
    : 'none';
  const emotion = VALID_EMOTIONS.includes(parsed.emotion as EmotionType)
    ? parsed.emotion as EmotionType
    : 'neutral';

  return {
    objection,
    is_objection: Boolean(parsed.is_objection ?? objection !== 'none'),
    emotion,
    intent: typeof parsed.intent === 'string' ? parsed.intent : 'general_query',
    stated_intent: Boolean(parsed.stated_intent),
    positive_affirmation: Boolean(parsed.positive_affirmation),
    asked_followup: Boolean(parsed.asked_followup),
    enthusiasm: Math.min(Math.max(Number(parsed.enthusiasm) || 0, 0), 10),
  };
}

// ── Objection rebuttals (injected into prompt context) ───────────────────────

const OBJECTION_CONTEXT: Record<ObjectionType, string> = {
  already_with_broker: `
Lead says they already have a broker. Reframe: "That's great — you already understand the business.
My question is: are you getting 100% brokerage share and daily payouts? Most brokers cap you at
60–70% and pay monthly. Rupeezy gives you 100% with daily payouts — no joining fee."`,

  not_enough_contacts: `
Lead says they don't have enough contacts. Reframe: "You'd be surprised — many of our top partners
started with just 5–10 clients. The RISE Portal helps you grow your network, and since there's zero
joining fee, there's no risk in starting small."`,

  client_support_concern: `
Lead worried about client support. Reframe: "That's a great question — it shows you care about your
clients. Rupeezy has a dedicated support team, real-time tracking on the RISE Portal, and you get a
personal RM assigned. You're never alone."`,

  trust_concern: `
Lead questions Rupeezy's credibility. Reframe: "Completely valid. Rupeezy is SEBI-registered, has
been growing rapidly, and our partners consistently receive daily payouts. I can send you a quick
summary with our track record — would that help?"`,

  defer_decision: `
Lead says they'll think about it or call later. Reframe: "Absolutely, no pressure. Let me send you
a short WhatsApp summary — program benefits, joining process, and a direct sign-up link. When you're
ready, it's all there. Can I send it to this number?"`,

  none: '',
};

// ── Stage machine rules ───────────────────────────────────────────────────────

/**
 * Pure function — given current stage + detection signals, return next stage.
 * No LLM call needed here; this is deterministic rule logic.
 */
export function advanceStage(
  currentStage: CallStage,
  detection: DetectionResult,
  turnCount: number,
  objectionsRaisedCount: number,
): StageTransition {

  // ── Hard end: lead explicitly not interested after multiple turns
  if (
    detection.intent === 'not_interested' &&
    detection.emotion === 'negative' &&
    turnCount >= 2
  ) {
    return { next_stage: 'ended', should_handoff: false, should_end: true, reason: 'lead_not_interested' };
  }

  // ── Handoff: high intent + positive emotion
  if (detection.stated_intent && detection.emotion !== 'negative') {
    return { next_stage: 'closing', should_handoff: true, should_end: false, reason: 'stated_intent_handoff' };
  }

  // ── Handoff: max turns reached
  if (turnCount >= 15) {
    return { next_stage: 'closing', should_handoff: true, should_end: false, reason: 'max_turns_reached' };
  }

  // ── Stage transitions
  switch (currentStage) {
    case 'greeting':
      // Move to pitch after first real response
      return { next_stage: 'pitch', should_handoff: false, should_end: false };

    case 'pitch':
      if (detection.is_objection) {
        return { next_stage: 'objection_handling', should_handoff: false, should_end: false };
      }
      if (detection.positive_affirmation || detection.asked_followup) {
        return { next_stage: 'qualification', should_handoff: false, should_end: false };
      }
      return { next_stage: 'pitch', should_handoff: false, should_end: false };

    case 'objection_handling':
      if (detection.is_objection) {
        // Another objection — stay in objection handling
        return { next_stage: 'objection_handling', should_handoff: false, should_end: false };
      }
      if (objectionsRaisedCount >= 3 && detection.emotion === 'negative') {
        // Too many unresolved objections, negative — end gracefully
        return { next_stage: 'closing', should_handoff: false, should_end: true, reason: 'too_many_objections' };
      }
      // Objection resolved — back to pitch or qualification
      return {
        next_stage: turnCount >= 4 ? 'qualification' : 'pitch',
        should_handoff: false,
        should_end: false,
      };

    case 'qualification':
      if (detection.is_objection) {
        return { next_stage: 'objection_handling', should_handoff: false, should_end: false };
      }
      // Only handoff if lead EXPLICITLY stated intent (asked for link / how to join)
      if (detection.stated_intent) {
        return { next_stage: 'closing', should_handoff: true, should_end: false, reason: 'stated_intent_handoff' };
      }
      // Keep qualifying — don't end just because they're positive or asking questions
      return { next_stage: 'qualification', should_handoff: false, should_end: false };

    case 'closing':
      return { next_stage: 'ended', should_handoff: false, should_end: true, reason: 'call_closed' };

    case 'ended':
      return { next_stage: 'ended', should_handoff: false, should_end: true };

    default:
      return { next_stage: 'pitch', should_handoff: false, should_end: false };
  }
}

// ── LLM-based detection ───────────────────────────────────────────────────────

/**
 * Classify a single user turn using the fast LLM.
 * Returns structured JSON with objection type, emotion, intent signals.
 *
 * Runs in ~200–400ms on MODEL_FAST.
 */
export async function classifyTurn(
  userInput: string,
  conversationHistory: Array<{ role: string; content: string }>,
  currentStage: CallStage,
): Promise<DetectionResult> {

  // Build a compact history snippet (last 3 turns max)
  const historySnippet = conversationHistory
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Lead' : 'Priya'}: ${m.content}`)
    .join('\n');

  const prompt = `You are analyzing a sales call for Rupeezy's partner program.

CONVERSATION SO FAR:
${historySnippet}

LATEST LEAD MESSAGE: "${userInput}"

CURRENT STAGE: ${currentStage}

Classify the lead's latest message. Return ONLY valid JSON, no markdown, no explanation:

{
  "objection": "<already_with_broker|not_enough_contacts|client_support_concern|trust_concern|defer_decision|none>",
  "is_objection": <true|false>,
  "emotion": "<positive|neutral|negative|confused>",
  "intent": "<positive_interest|information_request|objection|not_interested|general_query>",
  "stated_intent": <true|false>,
  "positive_affirmation": <true|false>,
  "asked_followup": <true|false>,
  "enthusiasm": <0-10>
}

Rules:
- stated_intent = true if lead asks for sign-up link, asks how to join, or says they want to proceed
- positive_affirmation = true if lead says yes/haan/bilkul/sounds good/interesting/acha
- asked_followup = true if lead asks a question about the program (payout, process, earnings, etc.)
- already_with_broker: lead mentions existing broker relationship
- not_enough_contacts: lead says they don't have clients/contacts/network
- client_support_concern: lead worried about support for their clients
- trust_concern: lead questions Rupeezy's credibility/trustworthiness/SEBI
- defer_decision: lead says "think about it", "call later", "baad mein", "soochna padega"`;

  try {
    const response = await ollama.chat({
      model: MODEL_FAST,
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      options: { num_predict: 250, temperature: 0.1 },
      stream: false,
    });

    const raw = response.message?.content?.trim() || '';
    // Strip markdown code fences if present
    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) {
      console.warn('[DecisionEngine] Empty/non-JSON LLM classification, using fallback', {
        model: MODEL_FAST,
        rawPreview: raw.slice(0, 120),
      });
      return fallbackClassify(userInput);
    }
    const parsed = JSON.parse(jsonStr) as Partial<DetectionResult>;
    return sanitizeDetection(parsed);

    // Sanitize — ensure all fields exist with safe defaults
    return {
      objection: parsed.objection ?? 'none',
      is_objection: Boolean(parsed.is_objection),
      emotion: parsed.emotion ?? 'neutral',
      intent: parsed.intent ?? 'general_query',
      stated_intent: Boolean(parsed.stated_intent),
      positive_affirmation: Boolean(parsed.positive_affirmation),
      asked_followup: Boolean(parsed.asked_followup),
      enthusiasm: Math.min(Math.max(Number(parsed.enthusiasm) || 0, 0), 10),
    };
  } catch (err) {
    console.warn('[DecisionEngine] LLM classification failed, using fallback:', err instanceof Error ? err.message : err);
    return fallbackClassify(userInput);
  }
}

/**
 * Fast keyword-based fallback — used when LLM call fails.
 * Covers the most common patterns in Hindi, Hinglish, and English.
 */
export function fallbackClassify(userInput: string): DetectionResult {
  const t = userInput.toLowerCase();

  // Objection detection
  let objection: ObjectionType = 'none';
  let is_objection = false;

  if (
    t.includes('already') || t.includes('pehle se') || t.includes('दूसरा broker') ||
    t.includes('another broker') || t.includes('zerodha') || t.includes('groww') ||
    t.includes('upstox') || t.includes('angel')
  ) {
    objection = 'already_with_broker'; is_objection = true;
  } else if (
    t.includes('contacts nahi') || t.includes('network nahi') || t.includes('clients nahi') ||
    t.includes("don't have contacts") || t.includes('not enough') || t.includes('koi nahi')
  ) {
    objection = 'not_enough_contacts'; is_objection = true;
  } else if (
    t.includes('support') || t.includes('problem') || t.includes('issue') ||
    t.includes('clients ko') || t.includes('help kaun') || t.includes('who will help')
  ) {
    objection = 'client_support_concern'; is_objection = true;
  } else if (
    t.includes('trusted') || t.includes('trustworthy') || t.includes('sebi') ||
    t.includes('fake') || t.includes('scam') || t.includes('real hai') ||
    t.includes('genuine') || t.includes('verified')
  ) {
    objection = 'trust_concern'; is_objection = true;
  } else if (
    t.includes('sochna') || t.includes('soochna') || t.includes('think') ||
    t.includes('baad mein') || t.includes('later') || t.includes('call back') ||
    t.includes('time nahi') || t.includes('busy')
  ) {
    objection = 'defer_decision'; is_objection = true;
  }

  // Emotion
  let emotion: EmotionType = 'neutral';
  if (
    t.includes('yes') || t.includes('haan') || t.includes('bilkul') ||
    t.includes('interested') || t.includes('great') || t.includes('acha') ||
    t.includes('wah') || t.includes('really') || t.includes('tell me more')
  ) {
    emotion = 'positive';
  } else if (
    t.includes('nahi') || t.includes('no') || t.includes('not interested') ||
    t.includes('band karo') || t.includes('stop') || t.includes('don\'t call')
  ) {
    emotion = 'negative';
  } else if (
    t.includes('samajh nahi') || t.includes('confused') || t.includes('kya matlab') ||
    t.includes("don't understand") || t.includes('what do you mean')
  ) {
    emotion = 'confused';
  }

  // Intent signals
  const stated_intent =
    t.includes('join') || t.includes('sign up') || t.includes('link bhejo') ||
    t.includes('kaise kare') || t.includes('how to start') || t.includes('register');

  const positive_affirmation =
    t.includes('haan') || t.includes('yes') || t.includes('bilkul') ||
    t.includes('sounds good') || t.includes('interesting') || t.includes('acha');

  const asked_followup =
    t.includes('kitna') || t.includes('how much') || t.includes('kab') ||
    t.includes('when') || t.includes('kaise') || t.includes('how') ||
    t.includes('kya process') || t.includes('what is the process') ||
    (t.includes('?') && !is_objection);

  const enthusiasm =
    stated_intent ? 8 :
    positive_affirmation ? 6 :
    asked_followup ? 5 :
    emotion === 'negative' ? 1 :
    emotion === 'confused' ? 2 : 3;

  const intent =
    stated_intent ? 'positive_interest' :
    is_objection ? 'objection' :
    emotion === 'negative' ? 'not_interested' :
    asked_followup ? 'information_request' : 'general_query';

  return {
    objection, is_objection, emotion, intent,
    stated_intent, positive_affirmation, asked_followup, enthusiasm,
  };
}

/**
 * Main entry point — classify turn AND compute stage transition.
 * Called once per user turn from the graph.
 */
export async function runDecisionEngine(
  userInput: string,
  conversationHistory: Array<{ role: string; content: string }>,
  currentStage: CallStage,
  turnCount: number,
  objectionsRaisedCount: number,
): Promise<DecisionResult> {

  // Run LLM classification
  const detection = await classifyTurn(userInput, conversationHistory, currentStage);

  // Run stage machine (pure, no LLM)
  const transition = advanceStage(currentStage, detection, turnCount, objectionsRaisedCount);

  console.log('[DecisionEngine] Turn classified:', {
    objection: detection.objection,
    emotion: detection.emotion,
    intent: detection.intent,
    stated_intent: detection.stated_intent,
    enthusiasm: detection.enthusiasm,
    next_stage: transition.next_stage,
    should_handoff: transition.should_handoff,
  });

  return { ...detection, ...transition };
}

/**
 * Get the rebuttal context string for a given objection.
 * Injected into the LLM prompt when an objection is active.
 */
export function getObjectionContext(objection: ObjectionType): string {
  return OBJECTION_CONTEXT[objection] || '';
}
