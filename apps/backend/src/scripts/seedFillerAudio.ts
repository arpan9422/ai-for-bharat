/**
 * Seed script — generates all filler audio via Sarvam TTS and uploads to S3.
 *
 * Usage:
 *   npx ts-node src/scripts/seedFillerAudio.ts
 *
 * Options (env vars):
 *   FORCE_REGENERATE=true   Re-upload even if the file already exists in S3
 */

import dotenv from 'dotenv';
dotenv.config();

import { FILLER_PHRASES, getFillerAudio } from '../services/tts/fillerAudioService';

async function main() {
  console.log('🎙  Filler Audio Cache Warm-up');
  console.log(`   Phrases to generate: ${FILLER_PHRASES.length}`);
  console.log('');

  for (const filler of FILLER_PHRASES) {
    try {
      const buf = await getFillerAudio(filler);
      console.log(`  ✅ ${filler.key} (${filler.language}) — ${(buf.length / 1024).toFixed(1)} KB`);
    } catch (err: any) {
      console.error(`  ❌ ${filler.key}: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
