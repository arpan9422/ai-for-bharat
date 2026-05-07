import { Ollama } from 'ollama';
import dotenv from 'dotenv';

dotenv.config();

const ollama = new Ollama({ host: process.env.OLLAMA_BASE_URL });

const MODEL      = process.env.OLLAMA_MODEL      || 'gpt-oss:120b-cloud';
const MODEL_FAST = process.env.OLLAMA_MODEL_FAST || 'deepseek-v4-flash:cloud';

export type ConversationMessage = { role: 'user' | 'assistant' | 'system'; content: string };
export type Language = 'hindi' | 'hinglish' | 'english';
export type LeadContext = { name?: string; phone: string; status: string };

export function buildSystemPrompt(language: Language, leadCtx: LeadContext): string {
  const langInstruction = language === 'hindi' ? 'Hindi (written in Roman script)' : language;

  return `
You are Priya, a friendly partner relationship executive at Rupeezy.
Your goal: qualify incoming partner leads for the Authorized Person (AP) program.

LANGUAGE: Respond ONLY in ${langInstruction}.
Switch language seamlessly if the user changes — do not announce the switch.

PERSONA: Warm, confident, concise. Use natural fillers: "haan", "bilkul", "dekho".
Keep responses under 3 sentences unless explaining a benefit.

GOALS (in order):
1. Greet and confirm identity
2. Pitch core value: 100% brokerage share, daily payout, zero joining fee
3. Handle objections using the KNOWLEDGE BASE provided
4. Qualify: Hot / Warm / Cold
5. Close with appropriate next action

LEAD INFO: ${JSON.stringify(leadCtx)}

RULES:
- NEVER fabricate product details not in the knowledge base
- NEVER be pushy or aggressive
- If lead says stop/not interested — close gracefully
`.trim();
}

export function detectLanguage(text: string): Language {
  const devanagariRatio = (text.match(/[\u0900-\u097F]/g) || []).length / text.length;
  if (devanagariRatio > 0.3) return 'hindi';

  const markers = ['nahi', 'kya', 'hoon', 'hai', 'bhai', 'agar', 'bahut', 'aur', 'mein'];
  const hits = markers.filter(m => text.toLowerCase().includes(m)).length;
  if (hits >= 2) return 'hinglish';

  return 'english';
}

/** Full agent turn — used in the production voice flow */
export async function generateAgentTurn(
  messages: ConversationMessage[],
  systemPrompt: string,
  ragContext: string[],
): Promise<string> {
  const contextStr = ragContext.length > 0
    ? '\n\nKNOWLEDGE BASE / CONTEXT:\n' + ragContext.join('\n---\n')
    : '';

  try {
    const response = await ollama.chat({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt + contextStr },
        ...messages,
      ],
      options: { num_predict: 200, temperature: 0.7 },
      stream: false,
    });

    return response.message.content;
  } catch (error) {
    console.error('LLM generation error:', error);
    return 'Main abhi theek se sun nahi pa rahi hoon, kya aap phir se bol sakte hain?';
  }
}

/** Fast single-turn call — non-streaming */
export async function generateSimpleReply(
  userText: string,
  systemPrompt: string,
): Promise<string> {
  try {
    const response = await ollama.chat({
      model: MODEL_FAST,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userText },
      ],
      options: { num_predict: 200, temperature: 0.6 },
      stream: false,
    });
    const content = response.message.content.trim();
    // Strip <think> blocks if present
    return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } catch (error) {
    console.error('LLM simple reply error:', error);
    return 'Sorry, I could not generate a response.';
  }
}

/**
 * Streaming token generator with full chat history support.
 * Pass history as ConversationMessage[] for proper multi-turn context.
 */
export async function* streamChatReply(
  messages: ConversationMessage[],
  systemPrompt: string,
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await ollama.chat({
      model: MODEL_FAST,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      options: { num_predict: 300, temperature: 0.6 },
      stream: true,
    });
    for await (const part of stream) {
      if (part.message?.content) yield part.message.content;
    }
  } catch (error) {
    console.error('LLM stream error:', error);
    yield 'Sorry, I could not generate a response.';
  }
}

/**
 * Streaming token generator — yields tokens as they arrive from the LLM.
 * Pipe into streamSentences() in sarvamTTS for lowest latency.
 */
export async function* streamSimpleReply(
  userText: string,
  systemPrompt: string,
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await ollama.chat({
      model: MODEL_FAST,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userText },
      ],
      options: { num_predict: 300, temperature: 0.6 },
      stream: true,
    });
    for await (const part of stream) {
      // Only yield content tokens — skip thinking tokens
      if (part.message?.content) yield part.message.content;
    }
  } catch (error) {
    console.error('LLM stream error:', error);
    yield 'Sorry, I could not generate a response.';
  }
}
