/**
 * Sarvam TTS Service — REST API based
 *
 * bulbul:v2 speakers: anushka, manisha, vidya, arya, abhilash, karun, hitesh
 */

export type SarvamLanguage = 'hi-IN' | 'en-IN';
export interface TTSStyleContext {
  stage?: 'greeting' | 'pitch' | 'objection_handling' | 'qualification' | 'closing' | 'ended';
  emotion?: 'positive' | 'neutral' | 'negative' | 'confused';
  isObjection?: boolean;
  intent?: string;
  score?: number;
}

export interface TTSOptions {
  pace?: number;
  temperature?: number;
}

const REST_ENDPOINT = 'https://api.sarvam.ai/text-to-speech';
const MODEL         = process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
const SPEAKER_HI    = process.env.SARVAM_TTS_SPEAKER_HI || 'priya';
const SPEAKER_EN    = process.env.SARVAM_TTS_SPEAKER_EN || 'ishita';
const PACE          = Number(process.env.SARVAM_TTS_PACE || '1.0');
const TEMPERATURE   = Number(process.env.SARVAM_TTS_TEMPERATURE || '0.6');

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveTTSStyle(context?: TTSStyleContext): Required<TTSOptions> {
  let pace = PACE;
  let temperature = TEMPERATURE;

  if (!context) return { pace: clamp(pace, 0.5, 2.0), temperature: clamp(temperature, 0.01, 1.0) };

  if (context.stage === 'greeting') {
    pace = 0.95;
    temperature = 0.65;
  }

  if (context.stage === 'pitch') {
    pace = 1.05;
    temperature = 0.6;
  }

  if (context.isObjection || context.stage === 'objection_handling') {
    pace = 0.9;
    temperature = 0.5;
  }

  if (context.emotion === 'confused' || context.emotion === 'negative') {
    pace = 0.85;
    temperature = 0.45;
  }

  if (context.emotion === 'positive' || context.intent === 'positive_interest') {
    pace = 1.05;
    temperature = 0.75;
  }

  if (context.stage === 'closing') {
    pace = context.score != null && context.score >= 75 ? 1.0 : 0.95;
    temperature = 0.55;
  }

  return {
    pace: clamp(pace, 0.5, 2.0),
    temperature: clamp(temperature, 0.01, 1.0),
  };
}

export function detectTTSLanguage(text: string, preferred: SarvamLanguage): SarvamLanguage {
  const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagari / Math.max(text.replace(/\s/g, '').length, 1) > 0.1) return 'hi-IN';
  const hinglish = /\b(haan|nahi|kya|hai|mein|aur|bhi|toh|bilkul|acha|theek|bolo|rupeezy|brokerage|payout|namaste|ji|dekho|samajh)\b/i;
  if (hinglish.test(text)) return 'hi-IN';
  return preferred;
}

export function prepareTextForTTS(text: string): string {
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/[`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned.replace(/\b\d{5,}\b/g, (num) => Number(num).toLocaleString('en-IN'));
  cleaned = cleaned
    .replace(/\s*([,!?।.])\s*/g, '$1 ')
    .replace(/\.{3,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return cleaned;

  const last = cleaned[cleaned.length - 1];
  if (!/[.!?।…]/.test(last)) {
    cleaned += /[\u0900-\u097F]/.test(cleaned) ? '।' : '.';
  }

  return cleaned;
}

async function synthesizeChunk(
  text: string,
  language: SarvamLanguage,
  options?: TTSOptions
): Promise<Buffer> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY not set');

  const res = await fetch(REST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      text: prepareTextForTTS(text),
      target_language_code: language,
      speaker: language === 'hi-IN' ? SPEAKER_HI : SPEAKER_EN,
      model: MODEL,
      pace: options?.pace ?? PACE,
      temperature: options?.temperature ?? TEMPERATURE,
      enable_preprocessing: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam REST ${res.status}: ${err}`);
  }

  const data = await res.json() as { audios: string[] };
  if (!data.audios?.[0]) throw new Error('Sarvam: no audio in response');
  return Buffer.from(data.audios[0], 'base64');
}

export async function synthesizeSpeechBuffer(
  text: string,
  language: SarvamLanguage = 'hi-IN',
  styleContext?: TTSStyleContext,
): Promise<Buffer> {
  const preparedText = prepareTextForTTS(text);
  const lang = detectTTSLanguage(preparedText, language);
  return synthesizeChunk(preparedText, lang, resolveTTSStyle(styleContext));
}

export async function* synthesizeSpeechStream(
  text: string,
  language: SarvamLanguage = 'hi-IN',
  styleContext?: TTSStyleContext,
): AsyncGenerator<Buffer, void, unknown> {
  const preparedText = prepareTextForTTS(text);
  const lang = detectTTSLanguage(preparedText, language);
  yield await synthesizeChunk(preparedText, lang, resolveTTSStyle(styleContext));
}

/**
 * Streaming: accumulate full LLM response, then synthesize once.
 * 
 * Why not sentence-by-sentence? Because:
 * 1. Hinglish responses often lack sentence-ending punctuation
 * 2. Sarvam REST is ~1s for short text — synthesizing the full response
 *    once is faster than 3 sequential sentence calls (~3s)
 * 3. Eliminates the "no audio" bug from incomplete sentence detection
 */
export async function* streamSentences(
  tokenStream: AsyncGenerator<string, void, unknown>,
  language: SarvamLanguage = 'hi-IN',
  styleContext?: TTSStyleContext,
): AsyncGenerator<Buffer, void, unknown> {
  // Accumulate full response
  let fullText = '';
  for await (const token of tokenStream) {
    fullText += token;
  }

  // Strip think tags
  fullText = prepareTextForTTS(fullText);

  if (!fullText) {
    console.warn('[sarvam-rest] Empty text — skipping TTS');
    return;
  }

  const lang = detectTTSLanguage(fullText, language);
  console.log(`[sarvam-rest] synthesizing (${lang}) ${fullText.length} chars:`, fullText.slice(0, 80));

  try {
    const chunk = await synthesizeChunk(fullText, lang, resolveTTSStyle(styleContext));
    console.log(`[sarvam-rest] got audio: ${chunk.length} bytes`);
    yield chunk;
  } catch (err: any) {
    console.error('[sarvam-rest] TTS failed:', err.message);
    // Don't throw — let the caller handle missing audio gracefully
  }
}
