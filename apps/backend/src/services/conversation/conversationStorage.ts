/**
 * Conversation Storage Service
 * 
 * Handles:
 * 1. Storing conversation transcripts in PostgreSQL
 * 2. Uploading audio recordings to S3
 * 3. Updating conversation metadata (score, duration, etc.)
 */

import { PrismaClient } from '@prisma/client';
import { uploadCallRecording, uploadCallRecordingChunk } from '../storage/s3Service';
import { ConversationState } from './conversationGraph';
import { generateCallSummary, RichCallSummary } from './callSummary';
import { Language, LeadProfile } from './startingScript';

const prisma = new PrismaClient();

/**
 * Transcript message format for database storage
 */
export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  language?: Language;
  intent?: string;
  emotion?: string;
  score?: number;
}

/**
 * Call summary format — re-exported from callSummary.ts for consumers
 */
export type { RichCallSummary as CallSummary } from './callSummary';

export interface RecordingChunk {
  index: number;
  key: string;
  sizeBytes: number;
  mimeType: string;
  speaker?: 'agent' | 'user';
  text?: string;
  timestamp?: number;
}

export interface RecordingChunkInput {
  audioBuffer: Buffer;
  mimeType: string;
  speaker?: 'agent' | 'user';
  text?: string;
  timestamp?: number;
}

export interface PreviousConversationContext {
  callId: string;
  date: string;
  score?: number;
  status?: string;
  keyPoints: string[];
  objectionsRaised: string[];
  statedIntent?: string | null;
  nextAction?: string;
}

export interface CallRecordLeadProfile {
  lead_id: string;
  phone: string;
  name?: string;
  language?: Language;
  occupation?: string;
  background?: string;
  callScript?: string;
}

function getSummaryObject(summary: unknown): Record<string, unknown> {
  return summary && typeof summary === 'object' && !Array.isArray(summary)
    ? summary as Record<string, unknown>
    : {};
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

/**
 * Create a new call record in the database
 */
export async function createCallRecord(
  leadId: string,
  conversationId: string,
  language: string = 'hinglish',
  leadProfile?: LeadProfile
): Promise<{ callId: string; leadId: string; leadProfile: CallRecordLeadProfile }> {
  try {
    const requestedLeadId = leadProfile?.lead_id || leadId;

    // Test pipeline calls must attach to an existing RM dashboard lead.
    // Leads are created from the dashboard; this path only creates call records.
    const lead = await prisma.lead.findUnique({ where: { id: requestedLeadId } });
    if (!lead) {
      throw new Error(`Lead not found: ${requestedLeadId}. Create the lead from the RM dashboard first.`);
    }

    // Create call record
    const call = await prisma.call.create({
      data: {
        id: conversationId,
        leadId: lead.id,
        transcript: [],
        language,
        startedAt: new Date(),
      },
    });

    console.log('[Storage] Created call record:', call.id);
    return {
      callId: call.id,
      leadId: lead.id,
      leadProfile: {
        lead_id: lead.id,
        phone: lead.phone,
        name: lead.name || undefined,
        language: isSupportedLanguage(lead.language) ? lead.language : asSupportedLanguage(language),
        occupation: lead.occupation || undefined,
        background: lead.background || undefined,
        callScript: lead.callScript || undefined,
      },
    };
  } catch (error) {
    console.error('[Storage] Error creating call record:', error);
    throw error;
  }
}

function isSupportedLanguage(value: string | null | undefined): value is Language {
  return value === 'hindi' || value === 'hinglish' || value === 'english';
}

function asSupportedLanguage(value: string): Language {
  return isSupportedLanguage(value) ? value : 'hinglish';
}

/**
 * Append a message to the conversation transcript
 */
export async function appendTranscriptMessage(
  conversationId: string,
  message: TranscriptMessage
): Promise<void> {
  try {
    const payload = JSON.stringify([message]);
    const updated = await prisma.$executeRaw`
      UPDATE "Call"
      SET "transcript" = COALESCE("transcript", '[]'::jsonb) || ${payload}::jsonb
      WHERE "id" = ${conversationId}
    `;

    if (updated === 0) {
      console.error('[Storage] Call not found:', conversationId);
      return;
    }

    console.log('[Storage] Appended message to transcript:', conversationId, message.role);
  } catch (error) {
    console.error('[Storage] Error appending transcript:', error);
    // Don't throw - we don't want to break the conversation flow
  }
}

/**
 * Update call metadata (score, duration, etc.)
 */
export async function updateCallMetadata(
  conversationId: string,
  state: ConversationState
): Promise<void> {
  try {
    await prisma.call.update({
      where: { id: conversationId },
      data: {
        score: state.score,
        language: state.detected_language,
      },
    });

    console.log('[Storage] Updated call metadata:', conversationId);
  } catch (error) {
    console.error('[Storage] Error updating call metadata:', error);
  }
}

/**
 * Finalize call record — generates rich LLM summary and persists to DB
 */
export async function finalizeCallRecord(
  conversationId: string,
  state: ConversationState,
  startTime: number
): Promise<RichCallSummary | null> {
  try {
    // Fetch full transcript from DB for summary generation
    const callRecord = await prisma.call.findUnique({
      where: { id: conversationId },
      select: { transcript: true },
    });

    const transcript = Array.isArray(callRecord?.transcript)
      ? (callRecord!.transcript as Array<{ role: string; content: string }>)
      : state.history;

    // Generate rich LLM summary
    const summary = await generateCallSummary(state, transcript, startTime);

    const durationSeconds = summary.durationSeconds;

    // Persist to DB
    await prisma.call.update({
      where: { id: conversationId },
      data: {
        summary: summary as unknown as Parameters<typeof prisma.call.update>[0]['data']['summary'],
        score: state.score,
        duration: durationSeconds,
        endedAt: new Date(),
      },
    });

    console.log('[Storage] Finalized call record with rich summary:', conversationId, {
      status: summary.status,
      score: summary.finalScore,
      nextAction: summary.nextAction,
      keyPoints: summary.keyPoints.length,
    });

    return summary;
  } catch (error) {
    console.error('[Storage] Error finalizing call:', error);
    return null;
  }
}

/**
 * Upload audio recording to S3 and update call record
 */
export async function uploadCallAudio(
  conversationId: string,
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm'
): Promise<void> {
  try {
    console.log('[Storage] Uploading audio to S3:', conversationId, 'size:', audioBuffer.length);

    // Upload to S3
    const { key, sizeBytes } = await uploadCallRecording(
      conversationId,
      audioBuffer,
      mimeType
    );

    // Update call record with S3 key
    await prisma.call.update({
      where: { id: conversationId },
      data: {
        recordingUrl: key,
        recordingSize: sizeBytes,
      },
    });

    console.log('[Storage] Audio uploaded successfully:', key);
  } catch (error) {
    console.error('[Storage] Error uploading audio:', error);
    // Don't throw - audio upload failure shouldn't break the flow
  }
}

/**
 * Upload conversation audio turns as separate S3 objects:
 * recordings/{conversationId}/recording1.mp3, recording2.mp3, ...
 */
export async function uploadCallAudioChunks(
  conversationId: string,
  audioChunks: RecordingChunkInput[],
  mimeType: string = 'audio/mpeg'
): Promise<RecordingChunk[]> {
  try {
    const chunks: RecordingChunk[] = [];

    for (const [idx, chunk] of audioChunks.entries()) {
      const index = idx + 1;
      const chunkMimeType = chunk.mimeType || mimeType;
      const audioBuffer = chunk.audioBuffer;
      console.log('[Storage] Uploading audio chunk:', conversationId, 'chunk:', index, 'size:', audioBuffer.length);

      const { key, sizeBytes } = await uploadCallRecordingChunk(
        conversationId,
        index,
        audioBuffer,
        chunkMimeType
      );

      chunks.push({
        index,
        key,
        sizeBytes,
        mimeType: chunkMimeType,
        speaker: chunk.speaker,
        text: chunk.text,
        timestamp: chunk.timestamp,
      });
    }

    if (chunks.length === 0) return chunks;

    const call = await prisma.call.findUnique({
      where: { id: conversationId },
      select: { summary: true },
    });

    const summary = call?.summary && typeof call.summary === 'object' && !Array.isArray(call.summary)
      ? call.summary as Record<string, unknown>
      : {};

    await prisma.call.update({
      where: { id: conversationId },
      data: {
        recordingUrl: chunks[0].key,
        recordingSize: chunks.reduce((total, chunk) => total + chunk.sizeBytes, 0),
        summary: {
          ...summary,
          recordingChunks: chunks,
        } as unknown as Parameters<typeof prisma.call.update>[0]['data']['summary'],
      },
    });

    console.log('[Storage] Audio chunks uploaded successfully:', conversationId, 'chunks:', chunks.length);
    return chunks;
  } catch (error) {
    console.error('[Storage] Error uploading audio chunks:', error);
    return [];
  }
}

/**
 * Get call record with transcript
 */
export async function getCallRecord(conversationId: string) {
  try {
    const call = await prisma.call.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
      },
    });

    return call;
  } catch (error) {
    console.error('[Storage] Error fetching call record:', error);
    return null;
  }
}

/**
 * Get all calls for a lead
 */
export async function getLeadCalls(leadId: string) {
  try {
    const calls = await prisma.call.findMany({
      where: { leadId },
      orderBy: { startedAt: 'desc' },
    });

    return calls;
  } catch (error) {
    console.error('[Storage] Error fetching lead calls:', error);
    return [];
  }
}

/**
 * Get compact context from the latest completed previous call for a lead.
 * Excludes the current call so repeat calls can start with continuity.
 */
export async function getPreviousConversationContext(
  leadId: string,
  currentConversationId: string
): Promise<PreviousConversationContext | null> {
  try {
    const previousCall = await prisma.call.findFirst({
      where: {
        leadId,
        id: { not: currentConversationId },
        endedAt: { not: null },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        score: true,
        summary: true,
        startedAt: true,
      },
    });

    if (!previousCall) return null;

    const summary = getSummaryObject(previousCall.summary);
    const finalScore = typeof summary.finalScore === 'number' ? summary.finalScore : previousCall.score;
    const status = typeof summary.status === 'string' ? summary.status : undefined;
    const statedIntent = typeof summary.statedIntent === 'string' ? summary.statedIntent : null;
    const nextAction = typeof summary.nextAction === 'string' ? summary.nextAction : undefined;

    return {
      callId: previousCall.id,
      date: previousCall.startedAt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      score: finalScore,
      status,
      keyPoints: getStringArray(summary.keyPoints).slice(0, 5),
      objectionsRaised: getStringArray(summary.objectionsRaised).slice(0, 5),
      statedIntent,
      nextAction,
    };
  } catch (error) {
    console.error('[Storage] Error fetching previous conversation context:', error);
    return null;
  }
}

/**
 * Update lead information from conversation
 */
export async function updateLeadFromConversation(
  leadId: string,
  state: ConversationState
): Promise<void> {
  try {
    const score = state.score;
    const status =
      score >= 75 ? 'HOT' :
      score >= 45 ? 'WARM' : 'COLD';

    const updateData: Record<string, unknown> = {
      score,
      language: state.detected_language,
      status,
    };

    // Update lead profile if available
    if (state.lead_profile) {
      if (state.lead_profile.name)       updateData.name = state.lead_profile.name;
      if (state.lead_profile.occupation) updateData.occupation = state.lead_profile.occupation;
      if (state.lead_profile.background) updateData.background = state.lead_profile.background;
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
    });

    console.log('[Storage] Updated lead:', leadId, status, 'score:', score);
  } catch (error) {
    console.error('[Storage] Error updating lead:', error);
  }
}

/**
 * Cleanup: Close Prisma connection
 */
export async function closeStorageConnection() {
  await prisma.$disconnect();
}
