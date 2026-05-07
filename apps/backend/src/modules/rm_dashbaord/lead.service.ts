import {
  bulkUpsertLeads,
  upsertLead,
  listLeads,
  getLeadById,
  getScoreDistribution,
  getCallAnalytics,
  getCallById,
} from './lead.repository';
import { BulkUploadInput, LeadFilter, LeadRow } from './lead.model';
import { getRecordingUrl } from '../../services/storage/s3Service';

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

  return chunks
    .filter((chunk): chunk is RecordingChunkManifest => {
      return !!chunk
        && typeof chunk === 'object'
        && typeof (chunk as RecordingChunkManifest).index === 'number'
        && typeof (chunk as RecordingChunkManifest).key === 'string'
        && typeof (chunk as RecordingChunkManifest).sizeBytes === 'number'
        && typeof (chunk as RecordingChunkManifest).mimeType === 'string';
    })
    .sort((a, b) => a.index - b.index);
}

// ── Upload a batch of leads ──────────────────────────────────────────────────
export async function uploadLeads(input: BulkUploadInput) {
  const results = await bulkUpsertLeads(input.leads);
  return {
    uploaded: results.length,
    leads: results.map((l) => ({ id: l.id, phone: l.phone, status: l.status })),
  };
}

// ── Upload a single lead ─────────────────────────────────────────────────────
export async function uploadSingleLead(data: LeadRow) {
  const lead = await upsertLead(data);
  return { id: lead.id, phone: lead.phone, status: lead.status };
}

// ── Paginated lead list ──────────────────────────────────────────────────────
export async function getLeads(filter: LeadFilter) {
  return listLeads(filter);
}

// ── Lead detail ──────────────────────────────────────────────────────────────
export async function getLeadDetail(id: string) {
  const lead = await getLeadById(id);
  if (!lead) throw new Error('Lead not found');
  return lead;
}

// ── Dashboard analytics ──────────────────────────────────────────────────────
export async function getDashboardAnalytics() {
  const [scoreDistribution, callAnalytics] = await Promise.all([
    getScoreDistribution(),
    getCallAnalytics(),
  ]);

  // Shape score distribution into { HOT, WARM, COLD } counts
  const buckets = { HOT: 0, WARM: 0, COLD: 0, avgScore: {} as Record<string, number> };
  for (const row of scoreDistribution) {
    buckets[row.status] = row._count.id;
    buckets.avgScore[row.status] = Math.round(row._avg.score ?? 0);
  }

  return {
    leadCounts: { HOT: buckets.HOT, WARM: buckets.WARM, COLD: buckets.COLD },
    avgScoreByStatus: buckets.avgScore,
    calls: callAnalytics,
  };
}

export async function getCallAudioChunks(callId: string) {
  const call = await getCallById(callId);
  if (!call) throw new Error('Call not found');

  const chunks = getRecordingChunks(call.summary);
  const signedChunks = await Promise.all(
    chunks.map(async chunk => ({
      ...chunk,
      url: await getRecordingUrl(chunk.key).catch(() => null),
    }))
  );

  return {
    callId: call.id,
    leadId: call.leadId,
    totalChunks: signedChunks.length,
    chunks: signedChunks,
  };
}
