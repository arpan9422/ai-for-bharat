import { z } from 'zod';

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const LeadRowSchema = z.object({
  phone: z.string().min(10),
  name: z.string().optional(),
  language: z.string().optional(),
  background: z.string().optional(),
  occupation: z.string().optional(),
  callScript: z.string().optional(), // RM-defined opening script
});

export const BulkUploadSchema = z.object({
  leads: z.array(LeadRowSchema).min(1),
});

export const LeadFilterSchema = z.object({
  status: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ── TypeScript types ─────────────────────────────────────────────────────────

export type LeadRow = z.infer<typeof LeadRowSchema>;
export type BulkUploadInput = z.infer<typeof BulkUploadSchema>;
export type LeadFilter = z.infer<typeof LeadFilterSchema>;
