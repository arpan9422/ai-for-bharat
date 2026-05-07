import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';

export function createDeepgramStream(
  onTranscript: (text: string, isFinal: boolean) => void,
  onSpeechFinal?: (text: string) => void,
): LiveClient {
  if (!process.env.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is not set');
  }

  const dg   = createClient(process.env.DEEPGRAM_API_KEY);
  const conn = dg.listen.live({
    model:            'nova-3',
    language:         'hi',       // Hindi — handles Hindi, Hinglish, and mixed Hindi/English
    smart_format:     true,
    interim_results:  true,
    endpointing:      500,        // wait 500ms of silence before finalizing (was 300 — too aggressive)
    utterance_end_ms: 1500,       // wait 1.5s after speech ends (was 1000)
    vad_events:       true,
  });

  conn.on(LiveTranscriptionEvents.Open, () => {
    console.log('[deepgram] connection open');
  });

  conn.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt  = data.channel?.alternatives?.[0];
    const text = alt?.transcript ?? '';

    if (!text) return;

    console.log('[deepgram] transcript isFinal:', data.is_final, 'speech_final:', data.speech_final, 'text:', text);

    onTranscript(text, data.is_final);

    if (data.speech_final && onSpeechFinal) {
      onSpeechFinal(text);
    }
  });

  conn.on(LiveTranscriptionEvents.UtteranceEnd, (data) => {
    console.log('[deepgram] UtteranceEnd');
    if (onSpeechFinal) onSpeechFinal('__utterance_end__');
  });

  conn.on(LiveTranscriptionEvents.Error, (err) => {
    console.error('[deepgram] error:', err);
  });

  conn.on(LiveTranscriptionEvents.Close, () => {
    console.log('[deepgram] connection closed');
  });

  return conn;
}
