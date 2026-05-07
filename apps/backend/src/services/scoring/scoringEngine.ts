/**
 * Lead Scoring Engine
 *
 * Four signal categories (max 100 pts total):
 *   Verbal Engagement   – 30 pts
 *   Engagement Duration – 20 pts
 *   Objection Pattern   – 25 pts
 *   Stated Intent       – 25 pts
 *
 * Thresholds:
 *   HOT  ≥ 75
 *   WARM 45–74
 *   COLD < 45
 */

export type LeadStatus = 'HOT' | 'WARM' | 'COLD';

// ── Signal shapes ────────────────────────────────────────────────────────────

/** Signals extracted per conversation turn by the LLM */
export type TurnSignals = {
  /** 0–10: enthusiasm level detected in this turn */
  enthusiasm: number;
  /** Did the lead ask a follow-up question? */
  asked_followup: boolean;
  /** Did the lead give a positive affirmation (yes, sure, sounds good, etc.)? */
  positive_affirmation: boolean;
  /** Was an objection raised in this turn? */
  objection_raised: boolean;
  /** Was a previously raised objection resolved in this turn? */
  objection_resolved: boolean;
  /** Did the lead explicitly express sign-up interest / ask for a link / ask how to start? */
  stated_intent: boolean;
};

/** Aggregated signals across the full conversation */
export type ConversationSignals = {
  turns: TurnSignals[];
  /** Actual call duration in seconds */
  callDurationSeconds: number;
  /** Median call duration in seconds (from historical data or config) */
  medianCallDurationSeconds: number;
  /** Did the lead stay through the pitch (i.e. call wasn't ended early by lead)? */
  stayedThroughPitch: boolean;
};

// ── Per-category scorers ─────────────────────────────────────────────────────

/** Verbal Engagement – max 30 pts */
function scoreVerbalEngagement(turns: TurnSignals[]): number {
  if (turns.length === 0) return 0;

  const avgEnthusiasm =
    turns.reduce((sum, t) => sum + t.enthusiasm, 0) / turns.length;
  const followupCount = turns.filter((t) => t.asked_followup).length;
  const affirmationCount = turns.filter((t) => t.positive_affirmation).length;

  // enthusiasm (0-10) → 0-18 pts
  const enthusiasmScore = (avgEnthusiasm / 10) * 18;

  // follow-up questions → up to 7 pts (cap at 3 questions)
  const followupScore = Math.min(followupCount, 3) * (7 / 3);

  // positive affirmations → up to 5 pts (cap at 3)
  const affirmationScore = Math.min(affirmationCount, 3) * (5 / 3);

  return Math.min(Math.round(enthusiasmScore + followupScore + affirmationScore), 30);
}

/** Engagement Duration – max 20 pts */
function scoreEngagementDuration(
  callDurationSeconds: number,
  medianCallDurationSeconds: number,
  stayedThroughPitch: boolean,
): number {
  if (medianCallDurationSeconds <= 0) return 0;

  const ratio = callDurationSeconds / medianCallDurationSeconds;

  // Duration relative to median → 0-12 pts
  // ratio ≥ 1.5 → full 12; ratio ≤ 0.3 → 0
  const durationScore = Math.min(Math.max((ratio - 0.3) / (1.5 - 0.3), 0), 1) * 12;

  // Stayed through pitch → 8 pts bonus
  const pitchBonus = stayedThroughPitch ? 8 : 0;

  return Math.min(Math.round(durationScore + pitchBonus), 20);
}

/** Objection Pattern – max 25 pts */
function scoreObjectionPattern(turns: TurnSignals[]): number {
  const objectionCount = turns.filter((t) => t.objection_raised).length;
  const resolvedCount = turns.filter((t) => t.objection_resolved).length;

  // Fewer objections = higher base (25 pts for 0 objections, down to 0 for ≥5)
  const baseScore = Math.max(25 - objectionCount * 5, 0);

  // Resolved objections add back up to 10 pts (cap at 2 resolutions)
  const resolvedBonus = Math.min(resolvedCount, 2) * 5;

  return Math.min(baseScore + resolvedBonus, 25);
}

/** Stated Intent – max 25 pts */
function scoreStatedIntent(turns: TurnSignals[]): number {
  const intentCount = turns.filter((t) => t.stated_intent).length;

  if (intentCount === 0) return 0;
  // First signal of intent → 20 pts; each additional → +2.5 pts, capped at 25
  return Math.min(20 + (intentCount - 1) * 2.5, 25);
}

// ── Public API ───────────────────────────────────────────────────────────────

export type ScoreBreakdown = {
  verbalEngagement: number;   // max 30
  engagementDuration: number; // max 20
  objectionPattern: number;   // max 25
  statedIntent: number;       // max 25
  total: number;              // max 100
  status: LeadStatus;
};

/** Compute the full score breakdown from aggregated conversation signals */
export function computeScore(signals: ConversationSignals): ScoreBreakdown {
  const verbalEngagement = scoreVerbalEngagement(signals.turns);
  const engagementDuration = scoreEngagementDuration(
    signals.callDurationSeconds,
    signals.medianCallDurationSeconds,
    signals.stayedThroughPitch,
  );
  const objectionPattern = scoreObjectionPattern(signals.turns);
  const statedIntent = scoreStatedIntent(signals.turns);

  const total = verbalEngagement + engagementDuration + objectionPattern + statedIntent;
  const status = classifyLead(total);

  return { verbalEngagement, engagementDuration, objectionPattern, statedIntent, total, status };
}

/** Classify a numeric score into HOT / WARM / COLD */
export function classifyLead(score: number): LeadStatus {
  if (score >= 75) return 'HOT';
  if (score >= 45) return 'WARM';
  return 'COLD';
}

// ── LLM signal extraction ────────────────────────────────────────────────────

/** Extract per-turn signals from a conversation turn via LLM */
export async function extractTurnSignals(
  turnContext: unknown,
  llmApiCall: (prompt: string) => Promise<string>,
): Promise<TurnSignals> {
  const prompt = `Analyse this sales conversation turn and return JSON only (no markdown):
{
  "enthusiasm": <0-10>,
  "asked_followup": <bool>,
  "positive_affirmation": <bool>,
  "objection_raised": <bool>,
  "objection_resolved": <bool>,
  "stated_intent": <bool>
}
TURN: ${JSON.stringify(turnContext)}`;

  try {
    const raw = await llmApiCall(prompt);
    const jsonStr = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr) as TurnSignals;
  } catch (err) {
    console.error('Error extracting turn signals:', err);
    return {
      enthusiasm: 0,
      asked_followup: false,
      positive_affirmation: false,
      objection_raised: false,
      objection_resolved: false,
      stated_intent: false,
    };
  }
}
