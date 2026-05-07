import {
  bulkUpsertLeads,
  upsertLead,
  listLeads,
  getLeadById,
  getScoreDistribution,
  getCallAnalytics,
} from './lead.repository';
import { BulkUploadInput, LeadFilter, LeadRow } from './lead.model';

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
