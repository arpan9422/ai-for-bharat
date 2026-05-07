/**
 * Filler Audio Service — In-memory cache, same voice as agent (manisha/bulbul:v2)
 *
 * Fillers are generated on first use and cached in memory.
 * No S3 dependency — avoids voice mismatch with stale S3 files.
 *
 * Context-aware selection:
 *   - Objection → empathetic filler ("Samajh gayi...")
 *   - Question → thinking filler ("Soch rahi hoon...")
 *   - Positive → quick acknowledgment ("Bilkul...")
 *   - Default → neutral ("Ek second...")
 */

import { synthesizeSpeechBuffer } from './sarvamTTS';

export type FillerLanguage = 'hi-IN' | 'en-IN';

export interface FillerPhrase {
  key: string;
  text: string;
  language: FillerLanguage;
  context: 'objection' | 'question' | 'positive' | 'neutral';
}

export const FILLER_PHRASES: FillerPhrase[] = [
  // Hindi/Hinglish fillers — manisha voice
  { key: 'ek-second',      text: 'Ek second...',                     language: 'hi-IN', context: 'neutral'   },
  { key: 'haan-dekhti',    text: 'Haan, abhi dekhti hoon.',          language: 'hi-IN', context: 'neutral'   },
  { key: 'samajh-gayi',    text: 'Samajh gayi, ek moment.',          language: 'hi-IN', context: 'objection' },
  { key: 'bilkul',         text: 'Bilkul, thoda wait karein.',       language: 'hi-IN', context: 'positive'  },
  { key: 'ji-haan',        text: 'Ji haan, abhi batati hoon.',       language: 'hi-IN', context: 'positive'  },
  { key: 'soch-rahi',      text: 'Soch rahi hoon, ek second.',       language: 'hi-IN', context: 'question'  },
  { key: 'acha-samjha',    text: 'Acha, samjha. Ek second.',         language: 'hi-IN', context: 'objection' },
  { key: 'haan-bilkul',    text: 'Haan bilkul, main batati hoon.',   language: 'hi-IN', context: 'positive'  },
  { key: 'dekho',          text: 'Dekho, ek second...',              language: 'hi-IN', context: 'question'  },
  // English fillers — anushka voice
  { key: 'one-moment',     text: 'One moment please.',               language: 'en-IN', context: 'neutral'   },
  { key: 'let-me-check',   text: 'Let me check that for you.',       language: 'en-IN', context: 'question'  },
  { key: 'sure-thing',     text: 'Sure, just a second.',             language: 'en-IN', context: 'positive'  },
  { key: 'i-understand',   text: 'I understand, one moment.',        language: 'en-IN', context: 'objection' },
  { key: 'looking-into',   text: 'Looking into that for you.',       language: 'en-IN', context: 'question'  },
];

// ── In-memory cache ───────────────────────────────────────────────────────────

const audioCache = new Map<string, Buffer>();
let cacheWarmedUp = false;

/**
 * Get filler audio buffer — generates and caches on first use.
 * Same voice as main agent (manisha for hi-IN, anushka for en-IN).
 */
export async function getFillerAudio(filler: FillerPhrase): Promise<Buffer> {
  const cacheKey = `${filler.language}:${filler.key}`;

  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  console.log(`[FillerAudio] Generating filler: ${filler.key} (${filler.language})`);
  const buffer = await synthesizeSpeechBuffer(filler.text, filler.language);
  audioCache.set(cacheKey, buffer);
  return buffer;
}

/**
 * Pre-warm the cache for a given language in the background.
 * Call this after the first greeting so fillers are ready.
 */
export function warmFillerCache(language: FillerLanguage): void {
  const fillers = FILLER_PHRASES.filter(f => f.language === language);
  for (const filler of fillers) {
    const cacheKey = `${filler.language}:${filler.key}`;
    if (!audioCache.has(cacheKey)) {
      // Fire and forget — don't await
      synthesizeSpeechBuffer(filler.text, filler.language)
        .then(buf => {
          audioCache.set(cacheKey, buf);
          console.log(`[FillerAudio] Cached: ${filler.key}`);
        })
        .catch(() => {}); // silent fail — filler is optional
    }
  }
}

/**
 * Select the most contextually appropriate filler.
 */
export function selectFiller(
  language: FillerLanguage,
  context: FillerPhrase['context'],
  lastUsedKey?: string,
): FillerPhrase {
  const candidates = FILLER_PHRASES.filter(
    f => f.language === language && f.context === context && f.key !== lastUsedKey
  );

  // Fall back to neutral if no context match
  const pool = candidates.length > 0
    ? candidates
    : FILLER_PHRASES.filter(f => f.language === language && f.key !== lastUsedKey);

  // Random pick from pool
  return pool[Math.floor(Math.random() * pool.length)] || FILLER_PHRASES[0];
}
