/**
 * Test WebSocket handler for the STT → LLM → TTS pipeline.
 * Mounted at /ws/test-voice
 *
 * Protocol:
 *   Client → { type: "AUDIO_CHUNK", payload: <base64 webm/opus> }
 *   Client → { type: "END_TURN" }   (manual override)
 *   Server → { type: "TRANSCRIPT",  payload: string }
 *   Server → { type: "AUDIO_PLAY",  payload: <base64 mp3> }
 *   Server → { type: "TURN_DONE" }
 *   Server → { type: "ERROR",       payload: string }
 */

import { WebSocket } from 'ws';
import { createDeepgramStream } from '../services/stt/deepgramService';
import { streamSentences, SarvamLanguage } from '../services/tts/sarvamTTS';
import { detectLanguage, streamSimpleReply } from '../services/llm/llmService';
import dotenv from 'dotenv';
dotenv.config();

const SYSTEM_PROMPT = `You are a helpful voice assistant. Answer the user's question clearly and concisely in 1-2 sentences. Match the language the user speaks (Hindi, Hinglish, or English). Answer it in small small sentences ending with ., !, ?, ।`;

export function setupTestVoiceConnection(ws: WebSocket) {
  let deepgramConn: ReturnType<typeof createDeepgramStream> | null = null;
  let finalTranscript = '';
  let isProcessing    = false;

  const send = (obj: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const handleTurn = async (transcript: string) => {
    if (isProcessing || !transcript.trim()) {
      console.log('[test-voice] handleTurn skipped isProcessing:', isProcessing);
      return;
    }
    isProcessing    = true;
    finalTranscript = '';
    console.log('[test-voice] handleTurn START transcript:', transcript);

    try {
      send({ type: 'TRANSCRIPT', payload: transcript });

      const lang    = detectLanguage(transcript);
      const ttsLang: SarvamLanguage = lang === 'english' ? 'en-IN' : 'hi-IN';
      console.log('[test-voice] streaming LLM→TTS lang:', ttsLang);

      const tokenStream = streamSimpleReply(transcript, SYSTEM_PROMPT);

      let firstTokenAt = 0;
      async function* loggedStream() {
        let full = '';
        for await (const t of tokenStream) {
          if (!firstTokenAt) {
            firstTokenAt = Date.now();
            console.log('[timing] first LLM token received');
          }
          full += t;
          yield t;
        }
        console.log('[test-voice] LLM full reply:', full);
        if (!full.trim()) {
          console.log('[test-voice] LLM returned empty — using fallback');
          yield 'Sorry, could you please repeat that?';
        }
      }

      let chunkCount = 0;
      for await (const chunk of streamSentences(loggedStream(), ttsLang)) {
        chunkCount++;
        if (chunkCount === 1 && firstTokenAt) {
          console.log(`[timing] first audio chunk — ${Date.now() - firstTokenAt}ms after first LLM token`);
        }
        console.log('[test-voice] TTS chunk', chunkCount, 'size:', chunk.length);
        send({ type: 'AUDIO_PLAY', payload: chunk.toString('base64') });
      }
      console.log('[test-voice] TTS done, total chunks:', chunkCount);
      send({ type: 'TURN_DONE' });
    } catch (err: any) {
      console.error('[test-voice] pipeline error:', err);
      send({ type: 'ERROR', payload: err?.message || 'Pipeline error' });
    } finally {
      isProcessing = false;
      console.log('[test-voice] handleTurn DONE, ready for next turn');
    }
  };

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'AUDIO_CHUNK') {
        if (!deepgramConn) {
          console.log('[test-voice] initialising Deepgram...');
          const pendingChunks: ArrayBuffer[] = [];
          let dgReady = false;

          deepgramConn = createDeepgramStream(
            (text, isFinal) => {
              console.log('[test-voice] Deepgram transcript isFinal:', isFinal, 'text:', text);
              if (isFinal && text.trim()) {
                finalTranscript = (finalTranscript + ' ' + text).trim();
                send({ type: 'TRANSCRIPT', payload: finalTranscript });
              }
            },
            (_text) => {
              console.log('[test-voice] speech_final/UtteranceEnd — transcript:', JSON.stringify(finalTranscript), 'isProcessing:', isProcessing);
              if (finalTranscript.trim() && !isProcessing) {
                const toProcess = finalTranscript;
                finalTranscript = '';
                handleTurn(toProcess);
              }
            },
          );

          deepgramConn.on('open' as any, () => {
            dgReady = true;
            console.log('[test-voice] Deepgram ready, flushing', pendingChunks.length, 'buffered chunks');
            for (const chunk of pendingChunks) deepgramConn!.send(chunk);
            pendingChunks.length = 0;
          });

          (deepgramConn as any).__pending = pendingChunks;
          (deepgramConn as any).__ready = () => dgReady;
        }

        const buf = Buffer.from(msg.payload, 'base64');
        const ab  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const pending: ArrayBuffer[]  = (deepgramConn as any).__pending;
        const isReady: () => boolean  = (deepgramConn as any).__ready;

        if (pending && !isReady()) pending.push(ab);
        else deepgramConn.send(ab);
      }

      if (msg.type === 'END_TURN') {
        if (finalTranscript.trim() && !isProcessing) handleTurn(finalTranscript);
      }
    } catch (err) {
      console.error('[test-voice] message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log('[test-voice] client disconnected');
    if (deepgramConn) deepgramConn.finish();
  });
}
