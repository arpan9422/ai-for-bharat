/**
 * Call Summary Service
 *
 * Generates a rich post-call summary at call end using a single LLM call.
 * The summary is stored in Call.summary (JSON) and surfaced on the RM dashboard.
 *
 * Schema:
 *   leadName          – lead's name or phone
 *   language          – detected language
 *   durationSeconds   – call duration
 *   finalScore        – 0–100
 *   status            – HOT | WARM | COLD
 *   keyPoints         – 3–5 bullet points of what was discussed
 *   objectionsRaised  – list of objection types raised
 *   objectionsResolved– list of objection types resolved
 *   statedIntent      – exact quote if lead expressed sign-up interest
 *   rmOpener          – suggested first sentence for RM follow-up call
 *   nextAction        – rm_queue | whatsapp | nurture
 *   whatsappMessage   – pre-written WhatsApp message for WARM leads
 */

import { Ollama } from 'ollama';
import dotenv from 'dotenv';
import { ConversationState } from './conversationGraph';
import { ObjectionType } from './decisionEngine';

dotenv.config();

const ollama = new Ollama({ host: process.env.OLLAMA_BASE_URL });
const MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud';

// ── Types ────────────────────────────────────────────────────────────────────

export type NextAction = 'rm_queue' | 'whatsapp' | 'nurture';

export interface RichCallSummary {
  // Identity
  leadName: string;
  language: string;

  // Metrics
  durationSeconds: number;
  finalScore: number;
  status: 'HOT' | 'WARM' | 'COLD';
  totalTurns: number;
  engagementLevel: string;

  // Conversation narrative
  keyPoints: string[];           // 3–5 bullets of what was discussed
  objectionsRaised: string[];    // human-readable objection labels
  objectionsResolved: string[];  // which ones were resolved
  statedIntent: string | null;   // exact quote if lead expressed interest

  // RM handoff
  rmOpener: string;              // suggested first sentence for RM
  nextAction: NextAction;

  // WhatsApp (for WARM leads)
  whatsappMessage: string | null;

  // Flags
  handoffOccurred: boolean;
  handoffReason: string | null;
  endReason: string | null;
}

// ── Objection label map ───────────────────────────────────────────────────────

const OBJECTION_LABELS: Record<string, string> = {
  already_with_broker:    'Already with another broker',
  not_enough_contacts:    'Not enough contacts/network',
  client_support_concern: 'Worried about client support',
  trust_concern:          'Questioned Rupeezy credibility',
  defer_decision:         'Deferred decision (think about it)',
  none:                   '',
};

function labelObjection(o: string): string {
  return OBJECTION_LABELS[o] || o;
}

// ── Next action logic ─────────────────────────────────────────────────────────

function determineNextAction(score: number, handoff: boolean): NextAction {
  if (score >= 75 || handoff) return 'rm_queue';
  if (score >= 45)            return 'whatsapp';
  return 'nurture';
}

// ── WhatsApp message template ─────────────────────────────────────────────────

function buildWhatsappMessage(
  leadName: string,
  language: string,
  keyPoints: string[],
): string {
  const name = leadName || 'there';
  const bullets = keyPoints.slice(0, 3).map(p => `• ${p}`).join('\n');

  if (language === 'hindi' || language === 'hinglish') {
    return `Namaste ${name}! 🙏

Rupeezy ke AP program ke baare mein humari baat hui thi. Yahan ek quick summary hai:

${bullets}

✅ Zero joining fee
✅ 100% brokerage share
✅ Daily payouts via RISE Portal

Jab bhi ready ho, yahan se join kar sakte hain:
👉 https://rupeezy.in/partner

Koi bhi sawaal ho toh reply karein — main yahan hoon!

— Priya, Rupeezy Partner Team`;
  }

  return `Hi ${name}! 👋

Following up on our conversation about Rupeezy's AP program. Here's a quick summary:

${bullets}

✅ Zero joining fee
✅ 100% brokerage share  
✅ Daily payouts via RISE Portal

Ready to get started? Join here:
👉 https://rupeezy.in/partner

Feel free to reply with any questions!

— Priya, Rupeezy Partner Team`;
}

// ── LLM summary generation ────────────────────────────────────────────────────

async function generateLLMSummary(
  transcript: Array<{ role: string; content: string }>,
  state: ConversationState,
  durationSeconds: number,
): Promise<{ keyPoints: string[]; statedIntent: string | null; rmOpener: string }> {

  // Build compact transcript text (last 20 messages max to stay within token budget)
  const transcriptText = transcript
    .slice(-20)
    .map(m => `${m.role === 'user' ? 'Lead' : 'Priya'}: ${m.content}`)
    .join('\n');

  const leadName = state.lead_profile?.name || 'the lead';
  const occupation = state.lead_profile?.occupation || 'unknown';
  const language = state.detected_language;
  const score = state.score;
  const status = score >= 75 ? 'HOT' : score >= 45 ? 'WARM' : 'COLD';

  const prompt = `You are summarizing a sales call for Rupeezy's partner program.

CALL DETAILS:
- Lead: ${leadName} (${occupation})
- Language: ${language}
- Duration: ${durationSeconds}s
- Score: ${score}/100 (${status})
- Objections raised: ${state.objections_raised?.join(', ') || 'none'}

TRANSCRIPT:
${transcriptText}

Generate a JSON summary. Return ONLY valid JSON, no markdown:

{
  "keyPoints": [
    "<3-5 concise bullet points of what was discussed — specific, not generic>",
    "..."
  ],
  "statedIntent": "<exact quote from lead if they expressed interest in joining, or null>",
  "rmOpener": "<one natural sentence an RM should use to open their follow-up call — reference something specific from this conversation, in ${language}>"
}

Rules:
- keyPoints must be specific to THIS conversation, not generic program facts
- statedIntent must be a direct quote from the transcript, or null
- rmOpener must reference something the lead actually said or asked about
- Keep rmOpener under 25 words`;

  try {
    const response = await ollama.chat({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      options: { num_predict: 400, temperature: 0.3 },
      stream: false,
    });

    const raw = response.message.content.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(raw);

    return {
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
      statedIntent: parsed.statedIntent || null,
      rmOpener: parsed.rmOpener || buildFallbackRmOpener(leadName, state, language),
    };
  } catch (err) {
    console.error('[CallSummary] LLM generation failed, using fallback:', err);
    return {
      keyPoints: buildFallbackKeyPoints(state),
      statedIntent: null,
      rmOpener: buildFallbackRmOpener(leadName, state, language),
    };
  }
}

// ── Fallbacks ─────────────────────────────────────────────────────────────────

function buildFallbackKeyPoints(state: ConversationState): string[] {
  const points: string[] = [];

  points.push(`Call lasted ${state.turn_count} turns in ${state.detected_language}`);

  if (state.objections_raised?.length > 0) {
    points.push(`Objections raised: ${state.objections_raised.map(labelObjection).join(', ')}`);
  }

  const score = state.score;
  if (score >= 75) {
    points.push('Lead showed strong interest in the AP program');
  } else if (score >= 45) {
    points.push('Lead showed moderate interest, needs follow-up');
  } else {
    points.push('Lead showed low engagement');
  }

  if (state.lead_profile?.occupation) {
    points.push(`Lead background: ${state.lead_profile.occupation}`);
  }

  return points;
}

function buildFallbackRmOpener(
  leadName: string,
  state: ConversationState,
  language: string,
): string {
  const name = leadName || 'there';
  const score = state.score;

  if (language === 'hindi' || language === 'hinglish') {
    if (score >= 75) {
      return `Namaste ${name}! Main Rupeezy se bol raha hoon — aapne Priya se baat ki thi AP program ke baare mein, aur aap interested lagte hain. Kya hum aage badh sakte hain?`;
    }
    return `Namaste ${name}! Rupeezy ki taraf se follow-up kar raha hoon — Priya se aapki baat hui thi. Koi sawaal tha jo main clear kar sakta hoon?`;
  }

  if (score >= 75) {
    return `Hi ${name}, following up from Rupeezy — you spoke with Priya about the AP program and seemed quite interested. Shall we take the next step?`;
  }
  return `Hi ${name}, this is a follow-up from Rupeezy — you had a conversation with Priya about our partner program. Happy to answer any questions you had.`;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a rich post-call summary from the final conversation state.
 * Called once at call end, before persisting to the database.
 *
 * @param state       Final ConversationState from the graph
 * @param transcript  Full transcript array (from DB or state.history)
 * @param startTime   Call start epoch ms
 */
export async function generateCallSummary(
  state: ConversationState,
  transcript: Array<{ role: string; content: string }>,
  startTime: number,
): Promise<RichCallSummary> {

  const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
  const score = state.score;
  const status: 'HOT' | 'WARM' | 'COLD' =
    score >= 75 ? 'HOT' : score >= 45 ? 'WARM' : 'COLD';

  const nextAction = determineNextAction(score, state.handoff);

  // Resolve which objections were handled (not still in objection_handling stage)
  const objectionsRaised = (state.objections_raised || [])
    .filter(o => o !== 'none')
    .map(labelObjection);

  // Objections resolved = raised but call didn't end in objection_handling
  const objectionsResolved = state.call_stage !== 'objection_handling'
    ? objectionsRaised
    : [];

  // Generate LLM narrative parts
  const { keyPoints, statedIntent, rmOpener } = await generateLLMSummary(
    transcript,
    state,
    durationSeconds,
  );

  // Build WhatsApp message for WARM leads
  const whatsappMessage = nextAction === 'whatsapp'
    ? buildWhatsappMessage(
        state.lead_profile?.name || '',
        state.detected_language,
        keyPoints,
      )
    : null;

  const summary: RichCallSummary = {
    leadName: state.lead_profile?.name || state.lead_id,
    language: state.detected_language,
    durationSeconds,
    finalScore: score,
    status,
    totalTurns: state.turn_count,
    engagementLevel: state.engagement_level,
    keyPoints,
    objectionsRaised,
    objectionsResolved,
    statedIntent,
    rmOpener,
    nextAction,
    whatsappMessage,
    handoffOccurred: state.handoff,
    handoffReason: state.handoff ? (state.end_reason || null) : null,
    endReason: state.end_reason || null,
  };

  console.log('[CallSummary] Generated summary:', {
    status,
    score,
    nextAction,
    keyPoints: keyPoints.length,
    objectionsRaised: objectionsRaised.length,
    statedIntent: !!statedIntent,
  });

  return summary;
}
