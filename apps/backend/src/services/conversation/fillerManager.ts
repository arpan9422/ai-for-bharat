/**
 * Filler Audio Manager
 * 
 * Manages filler audio playback during LLM processing delays.
 * Plays natural filler phrases when response takes > 500ms.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { FILLER_PHRASES, FillerLanguage, FillerPhrase } from '../tts/fillerAudioService';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Filler selection context
 */
export interface FillerContext {
  language: 'hindi' | 'hinglish' | 'english';
  intent?: string;
  emotion?: 'positive' | 'neutral' | 'negative' | 'confused';
  is_objection: boolean;
  turn_count: number;
  last_filler_used?: string;
}

/**
 * Get audio buffer from S3
 */
async function getFillerAudioBuffer(fillerKey: string, language: FillerLanguage): Promise<Buffer> {
  const BUCKET = process.env.AWS_BUCKET_NAME;
  if (!BUCKET) throw new Error('AWS_BUCKET_NAME is not set');

  const key = `fillers/${language}/${fillerKey}.wav`;
  
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }));

    if (!response.Body) {
      throw new Error('No audio data received from S3');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error('[FillerManager] Error fetching filler audio:', error);
    throw error;
  }
}

/**
 * Select appropriate filler based on context
 */
export function selectFiller(context: FillerContext): FillerPhrase {
  // Map language to FillerLanguage
  const fillerLang: FillerLanguage = context.language === 'english' ? 'en-IN' : 'hi-IN';
  
  // Filter fillers by language
  const availableFillers = FILLER_PHRASES.filter(f => f.language === fillerLang);
  
  // Avoid repeating the same filler
  const filteredFillers = context.last_filler_used
    ? availableFillers.filter(f => f.key !== context.last_filler_used)
    : availableFillers;
  
  const candidates = filteredFillers.length > 0 ? filteredFillers : availableFillers;
  
  // Context-based selection
  let selectedFiller: FillerPhrase;
  
  if (context.is_objection) {
    // For objections, use more thoughtful fillers
    const thoughtfulKeys = fillerLang === 'hi-IN' 
      ? ['samajh-gayi', 'soch-rahi', 'haan-dekhti']
      : ['let-me-check', 'looking-into'];
    
    const thoughtful = candidates.filter(f => thoughtfulKeys.includes(f.key));
    selectedFiller = thoughtful.length > 0 
      ? thoughtful[Math.floor(Math.random() * thoughtful.length)]
      : candidates[Math.floor(Math.random() * candidates.length)];
  }
  else if (context.emotion === 'confused') {
    // For confusion, use reassuring fillers
    const reassuringKeys = fillerLang === 'hi-IN'
      ? ['bilkul', 'ji-haan', 'samajh-gayi']
      : ['sure-thing', 'let-me-check'];
    
    const reassuring = candidates.filter(f => reassuringKeys.includes(f.key));
    selectedFiller = reassuring.length > 0
      ? reassuring[Math.floor(Math.random() * reassuring.length)]
      : candidates[Math.floor(Math.random() * candidates.length)];
  }
  else if (context.emotion === 'positive') {
    // For positive emotion, use quick acknowledgment
    const quickKeys = fillerLang === 'hi-IN'
      ? ['bilkul', 'ji-haan', 'ek-second']
      : ['sure-thing', 'one-moment'];
    
    const quick = candidates.filter(f => quickKeys.includes(f.key));
    selectedFiller = quick.length > 0
      ? quick[Math.floor(Math.random() * quick.length)]
      : candidates[Math.floor(Math.random() * candidates.length)];
  }
  else if (context.turn_count === 0) {
    // First turn - use polite fillers
    const politeKeys = fillerLang === 'hi-IN'
      ? ['ek-second', 'bilkul']
      : ['one-moment', 'sure-thing'];
    
    const polite = candidates.filter(f => politeKeys.includes(f.key));
    selectedFiller = polite.length > 0
      ? polite[Math.floor(Math.random() * polite.length)]
      : candidates[Math.floor(Math.random() * candidates.length)];
  }
  else {
    // Default: random selection
    selectedFiller = candidates[Math.floor(Math.random() * candidates.length)];
  }
  
  console.log('[FillerManager] Selected filler:', selectedFiller.key, 'for context:', {
    language: context.language,
    emotion: context.emotion,
    is_objection: context.is_objection,
    turn_count: context.turn_count,
  });
  
  return selectedFiller;
}

/**
 * Filler audio player with timeout
 */
export class FillerPlayer {
  private timeoutId: NodeJS.Timeout | null = null;
  private isPlaying: boolean = false;
  private currentFiller: string | null = null;
  
  /**
   * Start filler audio after delay
   * @param delayMs Delay before playing filler (default 500ms)
   * @param context Context for filler selection
   * @param onAudioReady Callback when audio buffer is ready
   */
  async start(
    delayMs: number = 500,
    context: FillerContext,
    onAudioReady: (audioBuffer: Buffer, fillerKey: string) => void
  ): Promise<void> {
    if (this.isPlaying) {
      console.log('[FillerManager] Filler already playing, skipping');
      return;
    }
    
    this.timeoutId = setTimeout(async () => {
      try {
        console.log('[FillerManager] Delay exceeded, playing filler');
        this.isPlaying = true;
        
        // Select appropriate filler
        const filler = selectFiller(context);
        this.currentFiller = filler.key;
        
        // Fetch audio from S3
        const audioBuffer = await getFillerAudioBuffer(filler.key, filler.language);
        
        console.log('[FillerManager] Filler audio ready:', filler.key, 'size:', audioBuffer.length);
        
        // Send to callback
        onAudioReady(audioBuffer, filler.key);
        
      } catch (error) {
        console.error('[FillerManager] Error playing filler:', error);
        this.isPlaying = false;
      }
    }, delayMs);
  }
  
  /**
   * Cancel filler playback (response arrived in time)
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
      console.log('[FillerManager] Filler cancelled - response arrived in time');
    }
    this.isPlaying = false;
  }
  
  /**
   * Mark filler as complete
   */
  complete(): void {
    this.isPlaying = false;
    console.log('[FillerManager] Filler playback complete');
  }
  
  /**
   * Get the last used filler key
   */
  getLastFillerUsed(): string | null {
    return this.currentFiller;
  }
  
  /**
   * Check if filler is currently playing
   */
  isActive(): boolean {
    return this.isPlaying;
  }
}

/**
 * Create a new filler player instance
 */
export function createFillerPlayer(): FillerPlayer {
  return new FillerPlayer();
}
