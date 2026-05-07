/**
 * Sarvam TTS Service — REST API based
 *
 * bulbul:v2 speakers: anushka, manisha, vidya, arya, abhilash, karun, hitesh
 */

export type SarvamLanguage = 'hi-IN' | 'en-IN';

const REST_ENDPOINT = 'https://api.sarvam.ai/text-to-speech';
const MODEL         = 'bulbul:v2';
const SPEAKER_HI    = 'manisha';
const SPEAKER_EN    = 'anushka';

export function detectTTSLanguage(text: string, preferred: SarvamLanguage): SarvamLanguage {
  const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagari / Math.max(text.replace(/\s/g, '').length, 1) > 0.1) return 'hi-IN';
  const hinglish = /\b(haan|nahi|kya|hai|mein|aur|bhi|toh|bilkul|acha|theek|bolo|rupeezy|brokerage|payout|namaste|ji|dekho|samajh)\b/i;
  if (hinglish.test(text)) return 'hi-IN';
  return preferred;
}

async function synthesizeChunk(text: string, language: SarvamLanguage): Promise<Buffer> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY not set');

  const res = await fetch(REST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: language,
      speaker: language === 'hi-IN' ? SPEAKER_HI : SPEAKER_EN,
      model: MODEL,
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
): Promise<Buffer> {
  const lang = detectTTSLanguage(text, language);
  return synthesizeChunk(text, lang);
}

export async function* synthesizeSpeechStream(
  text: string,
  language: SarvamLanguage = 'hi-IN',
): AsyncGenerator<Buffer, void, unknown> {
  const lang = detectTTSLanguage(text, language);
  yield await synthesizeChunk(text, lang);
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
): AsyncGenerator<Buffer, void, unknown> {
  // Accumulate full response
  let fullText = '';
  for await (const token of tokenStream) {
    fullText += token;
  }

  // Strip think tags
  fullText = fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  if (!fullText) {
    console.warn('[sarvam-rest] Empty text — skipping TTS');
    return;
  }

  const lang = detectTTSLanguage(fullText, language);
  console.log(`[sarvam-rest] synthesizing (${lang}) ${fullText.length} chars:`, fullText.slice(0, 80));

  try {
    const chunk = await synthesizeChunk(fullText, lang);
    console.log(`[sarvam-rest] got audio: ${chunk.length} bytes`);
    yield chunk;
  } catch (err: any) {
    console.error('[sarvam-rest] TTS failed:', err.message);
    // Don't throw — let the caller handle missing audio gracefully
  }
}
