/**
 * Conversation Storage Service
 * 
 * Handles:
 * 1. Storing conversation transcripts in PostgreSQL
 * 2. Uploading audio recordings to S3
 * 3. Updating conversation metadata (score, duration, etc.)
 */

import { PrismaClient } from '@prisma/client';
import { uploadCallRecording } from '../storage/s3Service';
import { ConversationState } from './conversationGraph';
import { generateCallSummary, RichCallSummary } from './callSummary';

const prisma = new PrismaClient();

/**
 * Transcript message format for database storage
 */
export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  language?: string;
  intent?: string;
  emotion?: string;
  score?: number;
}

/**
 * Call summary format — re-exported from callSummary.ts for consumers
 */
export type { RichCallSummary as CallSummary } from './callSummary';

/**
 * Create a new call record in the database
 */
export async function createCallRecord(
  leadId: string,
  conversationId: string,
  language: string = 'hinglish'
): Promise<string> {
  try {
    // Find or create lead
    let lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      // Create lead if doesn't exist
      lead = await prisma.lead.create({
        data: {
          id: leadId,
          phone: `temp_${leadId}`, // Temporary phone, should be updated
          language,
        },
      });
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
    return call.id;
  } catch (error) {
    console.error('[Storage] Error creating call record:', error);
    throw error;
  }
}

/**
 * Append a message to the conversation transcript
 */
export async function appendTranscriptMessage(
  conversationId: string,
  message: TranscriptMessage
): Promise<void> {
  try {
    // Get current transcript
    const call = await prisma.call.findUnique({
      where: { id: conversationId },
      select: { transcript: true },
    });

    if (!call) {
      console.error('[Storage] Call not found:', conversationId);
      return;
    }

    // Append new message
    const transcript = Array.isArray(call.transcript) ? call.transcript : [];
    transcript.push(message as any); // Cast to any for Prisma Json type

    // Update database
    await prisma.call.update({
      where: { id: conversationId },
      data: { transcript },
    });

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
