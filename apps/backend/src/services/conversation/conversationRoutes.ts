/**
 * Conversation API Routes
 * 
 * Endpoints for retrieving conversation history and recordings
 */

import { Router } from 'express';
import { getCallRecord, getLeadCalls } from './conversationStorage';
import { getRecordingUrl } from '../storage/s3Service';

const router = Router();

interface RecordingChunkManifest {
  index: number;
  key: string;
  sizeBytes: number;
  mimeType: string;
  speaker?: 'agent' | 'user';
  text?: string;
  timestamp?: number;
}

function getRecordingChunks(summary: unknown): RecordingChunkManifest[] {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return [];

  const chunks = (summary as { recordingChunks?: unknown }).recordingChunks;
  if (!Array.isArray(chunks)) return [];

  return chunks.filter((chunk): chunk is RecordingChunkManifest => {
    return !!chunk
      && typeof chunk === 'object'
      && typeof (chunk as RecordingChunkManifest).index === 'number'
      && typeof (chunk as RecordingChunkManifest).key === 'string'
      && typeof (chunk as RecordingChunkManifest).sizeBytes === 'number'
      && typeof (chunk as RecordingChunkManifest).mimeType === 'string';
  });
}

/**
 * GET /api/conversations/:conversationId
 * Get a specific conversation with transcript
 */
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const call = await getCallRecord(conversationId);
    
    if (!call) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Generate signed URL for recording if available
    let recordingUrl = null;
    if (call.recordingUrl) {
      try {
        recordingUrl = await getRecordingUrl(call.recordingUrl);
      } catch (error) {
        console.error('Error generating recording URL:', error);
      }
    }

    const recordingChunks = await Promise.all(
      getRecordingChunks(call.summary).map(async chunk => ({
        ...chunk,
        url: await getRecordingUrl(chunk.key).catch(() => null),
      }))
    );
    
    res.json({
      conversation_id: call.id,
      lead: {
        id: call.lead.id,
        name: call.lead.name,
        phone: call.lead.phone,
        status: call.lead.status,
      },
      transcript: call.transcript,
      summary: call.summary,
      score: call.score,
      duration: call.duration,
      language: call.language,
      recording_url: recordingUrl,
      recording_chunks: recordingChunks,
      recording_size: call.recordingSize,
      started_at: call.startedAt,
      ended_at: call.endedAt,
    });
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/conversations/lead/:leadId
 * Get all conversations for a specific lead
 */
router.get('/lead/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    
    const calls = await getLeadCalls(leadId);
    
    res.json({
      lead_id: leadId,
      total_calls: calls.length,
      calls: calls.map(call => ({
        conversation_id: call.id,
        score: call.score,
        duration: call.duration,
        language: call.language,
        summary: call.summary,
        started_at: call.startedAt,
        ended_at: call.endedAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching lead calls:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/conversations/:conversationId/recording
 * Get signed URL for conversation recording
 */
router.get('/:conversationId/recording', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const call = await getCallRecord(conversationId);
    
    if (!call) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    if (!call.recordingUrl) {
      return res.status(404).json({ error: 'Recording not available' });
    }
    
    const recordingUrl = await getRecordingUrl(call.recordingUrl);
    
    res.json({
      conversation_id: call.id,
      recording_url: recordingUrl,
      recording_size: call.recordingSize,
      expires_in: 3600, // 1 hour
    });
  } catch (error: any) {
    console.error('Error fetching recording URL:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
