/**
 * LangGraph-based Voice Pipeline WebSocket Handler
 * 
 * This handler manages voice conversations using a LangGraph state machine.
 * It integrates STT (Deepgram) → LangGraph Pipeline → TTS (Sarvam)
 * 
 * Protocol:
 *   Client → { type: "START_CALL", payload: { leadProfile?: LeadProfile } }
 *   Client → { type: "AUDIO_CHUNK", payload: <base64 webm/opus> }
 *   Client → { type: "END_TURN" }
 *   Client → { type: "END_CALL" }
 *   
 *   Server → { type: "GREETING", payload: string }
 *   Server → { type: "TRANSCRIPT", payload: string }
 *   Server → { type: "AUDIO_PLAY", payload: <base64 mp3> }
 *   Server → { type: "TURN_DONE" }
 *   Server → { type: "ERROR", payload: string }
 *   Server → { type: "CALL_ENDED" }
 */

import { WebSocket } from 'ws';
import { createDeepgramStream } from '../stt/deepgramService';
import {
  buildConversationGraph,
  buildPrepGraph,
  createConversationState,
  processUserTurn,
  ConversationState,
} from './conversationGraph';
import { LeadProfile } from './startingScript';
import { v4 as uuidv4 } from 'uuid';
import {
  createCallRecord,
  appendTranscriptMessage,
  updateCallMetadata,
  finalizeCallRecord,
  uploadCallAudio,
  uploadCallAudioChunks,
  updateLeadFromConversation,
  getPreviousConversationContext,
  RecordingChunkInput,
  TranscriptMessage,
} from './conversationStorage';
import { streamSimpleReply, streamChatReply } from '../llm/llmService';
import { buildPrompt } from './promptBuilder';
import { synthesizeSpeechBuffer, detectTTSLanguage } from '../tts/sarvamTTS';
import { computeScore } from '../scoring/scoringEngine';
import { CallStage } from './decisionEngine';

/**
 * Assemble a full conversation recording by concatenating all agent MP3 turns.
 * MP3 concatenation is valid — browsers and players handle it correctly.
 * The result is a single MP3 file containing everything Priya said in order.
 *
 * Why agent-only: agent audio is clean server-generated MP3.
 * User audio is webm/opus from browser mic — different format, can't mix without ffmpeg.
 * The transcript provides the user's side of the conversation.
 */
function assembleAgentRecording(turns: ConversationTurn[]): Buffer | null {
  const agentBuffers = turns
    .filter(t => t.speaker === 'agent' && t.audioBuffer)
    .map(t => t.audioBuffer!);

  if (agentBuffers.length === 0) return null;

  // Direct MP3 concatenation — valid for playback
  return Buffer.concat(agentBuffers);
}

async function uploadConversationAudioChunks(session: SessionData): Promise<boolean> {
  const chunks: RecordingChunkInput[] = session.conversationTurns
    .filter(t => t.audioBuffer && t.audioBuffer.length > 0)
    .map(t => ({
      audioBuffer: t.audioBuffer!,
      mimeType: t.mimeType || (t.speaker === 'agent' ? 'audio/mpeg' : 'audio/webm'),
      speaker: t.speaker,
      text: t.text,
      timestamp: t.timestamp,
    }));

  if (chunks.length === 0) return false;

  console.log(
    '[VoicePipeline] Uploading conversation audio chunks:',
    session.conversation_id,
    'chunks:',
    chunks.length
  );
  await uploadCallAudioChunks(session.conversation_id, chunks);
  return true;
}
/**
 * A single turn in the conversation recording.
 * We store agent MP3 buffers in order so we can assemble
 * a complete agent-side recording at call end.
 */
interface ConversationTurn {
  speaker: 'agent' | 'user';
  text: string;
  audioBuffer?: Buffer;
  mimeType?: string;
  timestamp: number;
}

interface SessionData {
  lead_id: string;
  conversation_id: string;
  conversationState: ConversationState;
  deepgramConn: ReturnType<typeof createDeepgramStream> | null;
  finalTranscript: string;
  isProcessing: boolean;
  graph: ReturnType<typeof buildConversationGraph>;
  prepGraph: ReturnType<typeof buildPrepGraph>;
  audioChunks: Buffer[];          // user mic audio (for STT/Deepgram only)
  currentUserAudioChunks: Buffer[];
  conversationTurns: ConversationTurn[];
  recordingStartTime: number;
  lastQuestionAsked?: string;
}

export function setupVoicePipelineConnection(ws: WebSocket) {
  let session: SessionData | null = null;

  const send = (obj: object) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  };

  /**
   * Initialize conversation session and send greeting
   */
  const startCall = async (leadProfile?: LeadProfile, lead_id?: string) => {
    try {
      console.log('[VoicePipeline] Starting new call session');
      
      const requestedLeadId = lead_id || leadProfile?.lead_id || leadProfile?.phone || uuidv4();
      const conversation_id = uuidv4();
      const graph = buildConversationGraph();
      const prepGraph = buildPrepGraph();

      // Create call record in database
      const { leadId: finalLeadId } = await createCallRecord(
        requestedLeadId,
        conversation_id,
        leadProfile?.language || 'hinglish',
        leadProfile
      );

      const previousConversation = await getPreviousConversationContext(finalLeadId, conversation_id);
      const enrichedLeadProfile = {
        ...leadProfile,
        lead_id: finalLeadId,
        previousConversation: previousConversation || undefined,
      };

      const initialState = createConversationState(finalLeadId, conversation_id, enrichedLeadProfile);

      // Run opening node to get greeting
      const greetingResult = await graph.invoke(initialState);
      
      session = {
        lead_id: finalLeadId,
        conversation_id,
        conversationState: greetingResult as ConversationState,
        deepgramConn: null,
        finalTranscript: '',
        isProcessing: false,
        graph,
        prepGraph,
        audioChunks: [],
        currentUserAudioChunks: [],
        conversationTurns: [],
        recordingStartTime: Date.now(),
      };

      // Store greeting in transcript
      if (greetingResult.response) {
        const greetingMessage: TranscriptMessage = {
          role: 'assistant',
          content: greetingResult.response,
          timestamp: Date.now(),
          language: greetingResult.detected_language,
          score: greetingResult.score,
        };
        await appendTranscriptMessage(conversation_id, greetingMessage);
      }

      // Send greeting to client + store agent audio turn
      if (greetingResult.response) {
        send({ type: 'GREETING', payload: greetingResult.response });
        
        if (greetingResult.audio_chunks && greetingResult.audio_chunks.length > 0) {
          const greetingAudio = Buffer.concat(greetingResult.audio_chunks);
          // Store greeting as first agent turn
          session.conversationTurns.push({
            speaker: 'agent',
            text: greetingResult.response,
            audioBuffer: greetingAudio,
            mimeType: 'audio/mpeg',
            timestamp: Date.now(),
          });
          for (const chunk of greetingResult.audio_chunks) {
            send({ type: 'AUDIO_PLAY', payload: chunk.toString('base64') });
          }
          send({ type: 'TURN_DONE' });
        }
      }

      console.log('[VoicePipeline] Call session started:', conversation_id);
      console.log('[VoicePipeline] Initial state:', {
        stage: greetingResult.stage,
        score: greetingResult.score,
        engagement: greetingResult.engagement_level,
      });
    } catch (error: any) {
      console.error('[VoicePipeline] Error starting call:', error);
      send({ type: 'ERROR', payload: error.message || 'Failed to start call' });
    }
  };

  /**
   * Process a complete user turn.
   * 
   * STREAMING ARCHITECTURE:
   *   1. parallelPrepare runs (DecisionEngine + RAG + History in parallel) ~4s
   *   2. Generate LLM streams tokens
   *   3. TTS starts on first sentence — audio plays while LLM still generating
   *   Total perceived latency: ~4s (parallelPrepare) + ~0.5s (first sentence TTS)
   */
  const handleUserTurn = async (transcript: string) => {
    if (!session || session.isProcessing || !transcript.trim()) return;

    session.isProcessing = true;
    session.finalTranscript = '';
    const userAudioBuffer = session.currentUserAudioChunks.length > 0
      ? Buffer.concat(session.currentUserAudioChunks)
      : undefined;
    session.currentUserAudioChunks = [];
    console.log('[VoicePipeline] Processing turn:', transcript);

    try {
      await appendTranscriptMessage(session.conversation_id, {
        role: 'user', content: transcript, timestamp: Date.now(),
      });
      send({ type: 'TRANSCRIPT', payload: transcript });

      // Store user turn (no audio buffer — we have the transcript)
      session.conversationTurns.push({
        speaker: 'user',
        text: transcript,
        audioBuffer: userAudioBuffer,
        mimeType: userAudioBuffer ? 'audio/webm' : undefined,
        timestamp: Date.now(),
      });

      const startTime = Date.now();

      // ── Step 1: Run ONLY parallelPrepare via graph ──
      const prepResult = await session.prepGraph.invoke(
        {
          ...session.conversationState,
          user_input: transcript,
          stage: 'conversation' as const,
          // Ensure call_stage advances from greeting after first turn
          call_stage: session.conversationState.call_stage === 'greeting'
            ? 'pitch' as CallStage
            : session.conversationState.call_stage,
        },
        { recursionLimit: 5 }
      ) as typeof session.conversationState;

      console.log('[VoicePipeline] PrepGraph done in', Date.now() - startTime, 'ms');

      // ── Step 2: Generate LLM response ──
      // Inject last question asked to prevent repetition
      const lastQ = session.lastQuestionAsked
        ? `\nIMPORTANT: You already asked "${session.lastQuestionAsked}" — do NOT ask this again.`
        : '';

      const systemPrompt = buildPrompt({
        stage: prepResult.call_stage,
        language: prepResult.detected_language,
        leadProfile: prepResult.lead_profile,
        activeObjection: prepResult.active_objection,
        objectionsRaised: prepResult.objections_raised,
        objectionsResolved: prepResult.objections_resolved,
        runningScore: prepResult.score,
        turnCount: prepResult.turn_count,
        ragChunks: prepResult.rag_context,
      }) + lastQ;

      // Build proper chat messages from history — this is the key fix.
      // Using actual role-based messages instead of embedding history as text
      // prevents the LLM from seeing context twice and causing repetition.
      const chatMessages = [
        // History (last 10 messages = 5 turns)
        ...prepResult.history
          .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
          .slice(-10)
          .map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        // Current user input
        { role: 'user' as const, content: transcript },
      ];

      // Collect full LLM response using multi-turn chat
      let fullResponse = '';
      const tokenStream = streamChatReply(chatMessages, systemPrompt);
      for await (const token of tokenStream) {
        fullResponse += token;
      }

      // Strip think blocks
      fullResponse = fullResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      // Contextual fallback if LLM returned nothing
      if (!fullResponse) {
        const lang = prepResult.detected_language;
        if (prepResult.call_stage === 'objection_handling' && prepResult.active_objection !== 'none') {
          fullResponse = lang === 'english'
            ? 'I understand your concern. Let me address that.'
            : 'Bilkul samajh aata hai. Main aapki baat ka jawab deta hoon.';
        } else if (prepResult.call_stage === 'pitch') {
          fullResponse = lang === 'english'
            ? 'Rupeezy offers 100% brokerage share with daily payouts and zero joining fee.'
            : 'Rupeezy mein 100% brokerage share milta hai, daily payout ke saath, aur joining fee bilkul nahi.';
        } else {
          fullResponse = lang === 'english' ? 'Could you tell me more?' : 'Kya aap thoda aur bata sakte hain?';
        }
        console.log('[VoicePipeline] Used contextual fallback');
      }

      console.log('[VoicePipeline] Response:', fullResponse.substring(0, 100));

      // Track last question to prevent repetition next turn
      if (session) {
        const questionMatch = fullResponse.match(/[^.!।]*\?[^?]*/);
        if (questionMatch) {
          session.lastQuestionAsked = questionMatch[0].trim().substring(0, 80);
        }
      }

      // TTS — synthesize full response
      const preferredLang = prepResult.detected_language === 'english' ? 'en-IN' : 'hi-IN';
      let audioChunkCount = 0;

      try {
        const ttsLang = detectTTSLanguage(fullResponse, preferredLang);
        const audioBuffer = await synthesizeSpeechBuffer(fullResponse, ttsLang);
        if (audioBuffer && audioBuffer.length > 0) {
          send({ type: 'AUDIO_PLAY', payload: audioBuffer.toString('base64') });
          audioChunkCount++;
          // Store agent turn with audio for recording assembly
          if (session) {
            session.conversationTurns.push({
              speaker: 'agent',
              text: fullResponse,
              audioBuffer,
              mimeType: 'audio/mpeg',
              timestamp: Date.now(),
            });
          }
        }
      } catch (ttsErr: any) {
        console.error('[VoicePipeline] TTS error:', ttsErr.message);
      }

      if (audioChunkCount === 0) {
        console.warn('[VoicePipeline] No audio generated for response:', fullResponse.substring(0, 60));
      }

      send({ type: 'TURN_DONE' });
      console.log('[VoicePipeline] Turn done | audio chunks:', audioChunkCount, '| time:', Date.now() - startTime, 'ms');

      const processingTime = Date.now() - startTime;
      console.log('[VoicePipeline] Total turn time:', processingTime, 'ms | audio chunks:', audioChunkCount);

      if (!session) return;

      // ── Compute score ──
      const newSignal = {
        enthusiasm:
          prepResult.intent === 'positive_interest' ? 8 :
          prepResult.emotion === 'positive' ? 6 :
          prepResult.intent === 'information_request' ? 5 :
          prepResult.emotion === 'negative' ? 1 : 3,
        asked_followup: prepResult.intent === 'information_request',
        positive_affirmation: prepResult.emotion === 'positive',
        objection_raised: prepResult.is_objection,
        objection_resolved: prepResult.is_objection && prepResult.call_stage !== 'objection_handling',
        stated_intent: prepResult.intent === 'positive_interest',
      };
      const turnSignals = [...(session.conversationState.turn_signals || []), newSignal];
      const scoreBreakdown = computeScore({
        turns: turnSignals,
        callDurationSeconds: Math.floor((Date.now() - session.recordingStartTime) / 1000),
        medianCallDurationSeconds: 120,
        stayedThroughPitch: prepResult.turn_count >= 3,
      });
      const newScore = scoreBreakdown.total;
      const engagement_level = scoreBreakdown.status === 'HOT' ? 'high' : scoreBreakdown.status === 'WARM' ? 'medium' : 'low';

      console.log(`[VoicePipeline] Score: ${newScore} (${scoreBreakdown.status}) | intent: ${prepResult.intent} | emotion: ${prepResult.emotion}`);

      // Update session state with full response + score
      session.conversationState = {
        ...prepResult,
        response: fullResponse,
        turn_count: prepResult.turn_count + 1,
        score: newScore,
        engagement_level,
        turn_signals: turnSignals,
      };

      // Store assistant response
      if (fullResponse) {
        await appendTranscriptMessage(session.conversation_id, {
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now(),
          language: prepResult.detected_language,
          intent: prepResult.intent,
          emotion: prepResult.emotion,
          score: prepResult.score,
        });
      }

      if (!session) return;
      await updateCallMetadata(session.conversation_id, session.conversationState);

      // Handoff
      if (prepResult.handoff) {
        if (!session) return;
        await updateLeadFromConversation(session.lead_id, prepResult);
        send({
          type: 'HANDOFF_REQUIRED',
          payload: {
            reason: prepResult.end_reason,
            score: prepResult.score,
            engagement: prepResult.engagement_level,
            lead_id: session.lead_id,
            conversation_id: session.conversation_id,
          }
        });
      }

      // End of conversation — only if explicitly triggered by scoring logic
      if (!session.conversationState.should_continue && session.conversationState.end_reason) {
        if (!session) return;
        await finalizeCallRecord(session.conversation_id, session.conversationState, session.recordingStartTime);
        await updateLeadFromConversation(session.lead_id, session.conversationState);
        send({ type: 'CALL_ENDING', payload: { reason: session.conversationState.end_reason, score: session.conversationState.score } });
      }

    } catch (error: any) {
      console.error('[VoicePipeline] Turn error:', error);
      send({ type: 'ERROR', payload: error.message || 'Failed to process turn' });
    } finally {
      if (session) session.isProcessing = false;
    }
  };

  /**
   * Initialize Deepgram STT connection
   */
  const initializeDeepgram = () => {
    if (!session) {
      console.error('[VoicePipeline] Cannot initialize Deepgram - no session');
      return;
    }

    console.log('[VoicePipeline] Initializing Deepgram connection');
    
    const pendingChunks: ArrayBuffer[] = [];
    let dgReady = false;

    session.deepgramConn = createDeepgramStream(
      (text, isFinal) => {
        if (!session) return;
        
        console.log('[VoicePipeline] Deepgram transcript - isFinal:', isFinal, 'text:', text);
        
        if (isFinal && text.trim()) {
          session.finalTranscript = (session.finalTranscript + ' ' + text).trim();
          send({ type: 'TRANSCRIPT', payload: session.finalTranscript });
        }
      },
      (_text) => {
        if (!session) return;
        
        console.log('[VoicePipeline] Speech final - transcript:', session.finalTranscript, 'isProcessing:', session.isProcessing);
        
        if (session.finalTranscript.trim() && !session.isProcessing) {
          const toProcess = session.finalTranscript;
          session.finalTranscript = '';
          handleUserTurn(toProcess);
        }
      }
    );

    session.deepgramConn.on('open' as any, () => {
      dgReady = true;
      console.log('[VoicePipeline] Deepgram ready, flushing', pendingChunks.length, 'buffered chunks');
      
      for (const chunk of pendingChunks) {
        session?.deepgramConn?.send(chunk);
      }
      pendingChunks.length = 0;
    });

    // Store pending chunks and ready state
    (session.deepgramConn as any).__pending = pendingChunks;
    (session.deepgramConn as any).__ready = () => dgReady;
  };

  /**
   * Handle incoming WebSocket messages
   */
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // START_CALL: Initialize session
      if (msg.type === 'START_CALL') {
        const leadProfile = msg.payload?.leadProfile as LeadProfile | undefined;
        const lead_id = msg.payload?.lead_id as string | undefined;
        await startCall(leadProfile, lead_id);
        return;
      }

      // Require active session for other message types
      if (!session) {
        send({ type: 'ERROR', payload: 'No active session. Send START_CALL first.' });
        return;
      }

      // AUDIO_CHUNK: Forward to Deepgram AND store for recording
      if (msg.type === 'AUDIO_CHUNK') {
        if (!session.deepgramConn) {
          initializeDeepgram();
        }

        const buf = Buffer.from(msg.payload, 'base64');
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        
        // Store audio chunk for recording
        session.audioChunks.push(buf);
        session.currentUserAudioChunks.push(buf);
        
        const pending: ArrayBuffer[] = (session.deepgramConn as any).__pending;
        const isReady: () => boolean = (session.deepgramConn as any).__ready;

        if (pending && !isReady()) {
          pending.push(ab);
        } else {
          session.deepgramConn?.send(ab);
        }
      }

      // END_TURN: Manual turn completion
      if (msg.type === 'END_TURN') {
        if (session.finalTranscript.trim() && !session.isProcessing) {
          handleUserTurn(session.finalTranscript);
        }
      }

      // END_CALL: Cleanup session
      if (msg.type === 'END_CALL') {
        console.log('[VoicePipeline] Ending call session:', session.conversation_id);
        
        if (session.deepgramConn) {
          session.deepgramConn.finish();
        }
        
        // Finalize call record — generates rich LLM summary
        const summary = await finalizeCallRecord(
          session.conversation_id, 
          session.conversationState, 
          session.recordingStartTime
        );
        
        // Update lead information
        await updateLeadFromConversation(session.lead_id, session.conversationState);
        
        const uploadedConversationChunks = await uploadConversationAudioChunks(session);
        if (!uploadedConversationChunks && session.audioChunks.length > 0) {
          // Fallback: upload user mic audio
          const fullRecording = Buffer.concat(session.audioChunks);
          await uploadCallAudio(session.conversation_id, fullRecording, 'audio/webm');
        }
        
        // Send final stats + summary to client
        send({ 
          type: 'CALL_ENDED',
          payload: {
            conversation_id: session.conversation_id,
            turn_count: session.conversationState.turn_count,
            final_score: session.conversationState.score,
            engagement: session.conversationState.engagement_level,
            handoff_occurred: session.conversationState.handoff,
            // Rich summary fields for the test UI
            summary: summary ? {
              status: summary.status,
              keyPoints: summary.keyPoints,
              objectionsRaised: summary.objectionsRaised,
              statedIntent: summary.statedIntent,
              rmOpener: summary.rmOpener,
              nextAction: summary.nextAction,
              whatsappMessage: summary.whatsappMessage,
            } : null,
          }
        });
        session = null;
      }

    } catch (error: any) {
      console.error('[VoicePipeline] Message handling error:', error);
      send({ type: 'ERROR', payload: error.message || 'Message handling error' });
    }
  });

  ws.on('close', async () => {
    console.log('[VoicePipeline] Client disconnected');
    
    if (session) {
      await finalizeCallRecord(
        session.conversation_id,
        session.conversationState,
        session.recordingStartTime
      );
      
      await updateLeadFromConversation(session.lead_id, session.conversationState);
      
      const uploadedConversationChunks = await uploadConversationAudioChunks(session);
      if (!uploadedConversationChunks && session.audioChunks.length > 0) {
        const fullRecording = Buffer.concat(session.audioChunks);
        await uploadCallAudio(session.conversation_id, fullRecording, 'audio/webm');
      }
      
      if (session.deepgramConn) {
        session.deepgramConn.finish();
      }
    }
    
    session = null;
  });

  /**
   * Handle WebSocket errors
   */
  ws.on('error', async (error) => {
    console.error('[VoicePipeline] WebSocket error:', error);
    
    if (session) {
      // Finalize call on error
      await finalizeCallRecord(
        session.conversation_id,
        session.conversationState,
        session.recordingStartTime
      );
      
      if (session.deepgramConn) {
        session.deepgramConn.finish();
      }
    }
    
    session = null;
  });
}
