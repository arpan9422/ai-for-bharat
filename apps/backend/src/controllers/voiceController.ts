import { WebSocket } from 'ws';
import { createDeepgramStream } from '../services/stt/deepgramService';
import { synthesizeSpeechStream } from '../services/tts/sarvamTTS';
import { generateAgentTurn, buildSystemPrompt, detectLanguage } from '../services/llm/llmService';
import { retrieveRelevantChunks } from '../services/rag/ragService';
import { checkInputRelevance, sanitizeOutput, filterWebSearchResults } from '../services/guardrails/guardrailsService';
import { appendMessage, getHistory, getLeadContext, initSession } from '../services/memory/sessionStore';
import { uploadCallRecording } from '../services/storage/s3Service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function setupVoiceConnection(ws: WebSocket) {
  let callId: string | null = null;
  let isAgentSpeaking = false;
  let userAudioChunks: Buffer[] = [];
  
  // We initialize the STT stream but we don't start sending until we get START_CALL
  let deepgramConn: any = null;

  // Handles the pipeline when the user finishes speaking a turn
  const handleTurnComplete = async (transcript: string) => {
    if (!callId) return;

    try {
      // 1. Input Guardrail
      const isRelevant = await checkInputRelevance(transcript);
      if (!isRelevant) {
        // We could optionally give a canned response or just append the message and let Priya handle it gracefully
        // For now, let's let Priya handle it, but maybe add a system note.
      }

      await appendMessage(callId, 'user', transcript);
      
      const history = await getHistory(callId);
      const leadCtx = await getLeadContext(callId);
      const language = detectLanguage(transcript);
      
      const systemPrompt = buildSystemPrompt(language, leadCtx || { phone: 'Unknown', status: 'COLD' });

      // 2. RAG Retrieval + Tavily Web Search (inside ragService)
      let ragContext = await retrieveRelevantChunks(transcript);
      
      // 3. Filter the search results to block competitor promo
      ragContext = await filterWebSearchResults(ragContext);

      // 4. Generate LLM Response
      let rawAgentResponse = await generateAgentTurn(history, systemPrompt, ragContext);

      // 5. Output Guardrail (Sanitize "guarantee" etc.)
      const safeAgentResponse = await sanitizeOutput(rawAgentResponse);
      
      await appendMessage(callId, 'assistant', safeAgentResponse);

      // 6. Streaming TTS
      isAgentSpeaking = true;
      const audioStream = synthesizeSpeechStream(safeAgentResponse, language === 'hindi' || language === 'hinglish' ? 'hi-IN' : 'en-IN');
      
      for await (const audioChunk of audioStream) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'AUDIO_PLAY', payload: audioChunk.toString('base64') }));
        }
      }
    } catch (err) {
      console.error('Error handling turn:', err);
    } finally {
      isAgentSpeaking = false;
    }
  };

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'START_CALL') {
      callId = msg.callId;
      const leadId = msg.leadId;
      
      // Initialize Redis session
      await initSession(callId!, { leadId });
      
      // Initialize Deepgram STT
      deepgramConn = createDeepgramStream((text, isFinal) => {
        if (isFinal && !isAgentSpeaking && text.trim().length > 0) {
          handleTurnComplete(text);
        }
      });
      
      console.log(`Call started: ${callId}`);
    }

    if (msg.type === 'AUDIO_CHUNK' && !isAgentSpeaking && deepgramConn) {
      const audioBuffer = Buffer.from(msg.payload, 'base64');
      userAudioChunks.push(audioBuffer);
      deepgramConn.send(audioBuffer);
    }

    if (msg.type === 'END_CALL' && callId) {
      console.log(`Call ended: ${callId}`);
      
      // Save recording to S3
      const fullAudio = Buffer.concat(userAudioChunks);
      const { key, sizeBytes } = await uploadCallRecording(callId, fullAudio);
      
      // Here you would trigger finalizeCall logic to generate summary and score
      // await finalizeCall(callId);
      
      ws.close();
    }
  });

  ws.on('close', () => {
    if (deepgramConn) deepgramConn.finish();
    console.log(`WebSocket disconnected for call: ${callId}`);
  });
}
