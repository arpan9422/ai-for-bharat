/**
 * Prompt Builder — builds the full system prompt per turn.
 * History is passed separately as chat messages, NOT embedded in the system prompt.
 * This prevents the LLM from seeing history twice (which causes repetition).
 */

import { CallStage, ObjectionType, getObjectionContext } from './decisionEngine';
import { LeadProfile } from './startingScript';

// ── Stage instructions ────────────────────────────────────────────────────────

const STAGE_INSTRUCTIONS: Record<CallStage, string> = {
  greeting: `Greet the lead warmly by name. Confirm you're speaking to the right person. 
Ask one soft open-ended question to get them talking — e.g. "Aap kya karte hain professionally?" 
Do NOT pitch yet. Just open the conversation naturally.`,

  pitch: `You've confirmed who they are. Now pitch the 3 core benefits naturally — not as a list:
- Zero joining fee (no risk to start)
- 100% brokerage share (industry gives 60-70%, Rupeezy gives 100%)  
- Daily payouts via RISE Portal (not monthly — daily)
Tailor to their background. End with ONE engaging question.`,

  objection_handling: `The lead raised an objection. 
1. First acknowledge it genuinely — show you heard them
2. Use the OBJECTION ANCHOR below as your reasoning (don't recite it verbatim)
3. Reference something specific they said earlier in the conversation
4. End with a soft re-engaging question`,

  qualification: `You've pitched and handled objections. Now listen and qualify.
Ask ONE question about their situation — client base size, current setup, or what would help them decide.
Do NOT re-pitch. You're in listening mode.`,

  closing: `Wrap up based on their interest level.
- High interest: confirm next step (sign-up link or RM callback)
- Medium interest: offer WhatsApp summary with sign-up link  
- Low interest: close gracefully, leave door open
Keep it brief. Do not re-pitch.`,

  ended: `Call ended. Do not respond.`,
};

// ── Language instructions ─────────────────────────────────────────────────────

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  hindi:    `Hindi mein jawab do. Technical terms jaise "brokerage", "payout" Roman script mein theek hain.`,
  hinglish: `Hinglish mein jawab do — natural mix of Hindi and English. Short sentences. Fillers: "haan", "bilkul", "dekho", "acha".`,
  english:  `Reply in conversational Indian English. Warm, professional, short sentences.`,
};

export interface PromptContext {
  stage: CallStage;
  language: 'hindi' | 'hinglish' | 'english';
  leadProfile?: LeadProfile;
  activeObjection?: ObjectionType;
  objectionsRaised: ObjectionType[];
  objectionsResolved: ObjectionType[];
  runningScore: number;
  turnCount: number;
  ragChunks?: string[];
}

/**
 * Build system prompt only — history is passed as separate chat messages.
 * This prevents double-history which causes repetition.
 */
export function buildPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  // Persona
  parts.push(
    `You are Priya, a warm partner relationship executive at Rupeezy.\n` +
    `You listen carefully and respond to what the lead ACTUALLY said — never repeat yourself.\n` +
    `Max 2-3 sentences. Natural, not scripted.`
  );

  // Language
  parts.push(`LANGUAGE: ${LANGUAGE_INSTRUCTIONS[ctx.language] || LANGUAGE_INSTRUCTIONS.hinglish}`);

  // Stage
  parts.push(`STAGE [${ctx.stage.toUpperCase()}]:\n${STAGE_INSTRUCTIONS[ctx.stage] || STAGE_INSTRUCTIONS.pitch}`);

  // Lead context
  if (ctx.leadProfile) {
    const { name, occupation, background } = ctx.leadProfile;
    const parts2: string[] = [];
    if (name)       parts2.push(`Name: ${name}`);
    if (occupation) parts2.push(`Occupation: ${occupation}`);
    if (background) parts2.push(`Background: ${background}`);
    if (parts2.length) parts.push(`LEAD: ${parts2.join(' | ')}`);
  }

  // Conversation state
  const scoreLabel = ctx.runningScore >= 75 ? 'HOT' : ctx.runningScore >= 45 ? 'WARM' : 'COLD';
  const objStr = ctx.objectionsRaised.filter(o => o !== 'none').join(', ');
  parts.push(
    `STATE: Turn ${ctx.turnCount} | Score ${ctx.runningScore}/100 (${scoreLabel})` +
    (objStr ? ` | Objections raised: ${objStr}` : '')
  );

  // Objection anchor
  if (ctx.stage === 'objection_handling' && ctx.activeObjection && ctx.activeObjection !== 'none') {
    const anchor = getObjectionContext(ctx.activeObjection);
    if (anchor) parts.push(`OBJECTION ANCHOR (adapt naturally):\n${anchor.trim()}`);
  }

  // RAG knowledge
  if (ctx.ragChunks?.length) {
    parts.push(`KNOWLEDGE BASE:\n${ctx.ragChunks.slice(0, 2).join('\n---\n')}`);
  }

  // Critical rules
  parts.push(
    `RULES:\n` +
    `- NEVER repeat a question you already asked\n` +
    `- ALWAYS acknowledge what the lead just said before responding\n` +
    `- NEVER fabricate product facts\n` +
    `- Max 3 sentences\n` +
    `- End with a question OR a clear next step`
  );

  return parts.join('\n\n');
}
