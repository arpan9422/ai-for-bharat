import { PrismaClient, LeadStatus } from '@prisma/client';
import { LeadRow, LeadFilter } from './lead.model';

const prisma = new PrismaClient();

// ── Upsert a single lead (idempotent by phone) ───────────────────────────────
export async function upsertLead(data: LeadRow) {
  return prisma.lead.upsert({
    where: { phone: data.phone },
    update: {
      name: data.name,
      language: data.language,
      background: data.background,
      occupation: data.occupation,
      ...(data.callScript !== undefined && { callScript: data.callScript }),
    },
    create: {
      phone: data.phone,
      name: data.name,
      language: data.language,
      background: data.background,
      occupation: data.occupation,
      callScript: data.callScript,
    },
  });
}

// ── Bulk upsert ──────────────────────────────────────────────────────────────
export async function bulkUpsertLeads(leads: LeadRow[]) {
  return Promise.all(leads.map(upsertLead));
}

// ── Paginated list with optional status filter ───────────────────────────────
export async function listLeads(filter: LeadFilter) {
  const { status, page, limit } = filter;
  const skip = (page - 1) * limit;

  const where = status ? { status: status as LeadStatus } : {};

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { score: 'desc' },
      include: { _count: { select: { calls: true } } },
    }),
    prisma.lead.count({ where }),
  ]);

  return { items, total, page, limit };
}

// ── Single lead with full call history ──────────────────────────────────────
export async function getLeadById(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      calls: {
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          score: true,
          scoreBreakdown: true,
          duration: true,
          language: true,
          startedAt: true,
          endedAt: true,
          summary: true,
        },
      },
      whatsappLogs: { orderBy: { sentAt: 'desc' } },
    },
  });
}

// ── Score distribution for analytics ────────────────────────────────────────
export async function getScoreDistribution() {
  return prisma.lead.groupBy({
    by: ['status'],
    _count: { id: true },
    _avg: { score: true },
  });
}

// ── Aggregate call analytics ─────────────────────────────────────────────────
export async function getCallAnalytics() {
  const [totalCalls, avgDuration, recentCalls] = await Promise.all([
    prisma.call.count(),
    prisma.call.aggregate({ _avg: { duration: true, score: true } }),
    prisma.call.findMany({
      take: 10,
      orderBy: { startedAt: 'desc' },
      include: { lead: { select: { name: true, phone: true, status: true } } },
    }),
  ]);

  return { totalCalls, avgDuration: avgDuration._avg, recentCalls };
}
