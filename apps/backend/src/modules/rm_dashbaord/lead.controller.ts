import { Request, Response } from 'express';
import {
  uploadLeads,
  uploadSingleLead,
  getLeads,
  getLeadDetail,
  getDashboardAnalytics,
  getCallAudioChunks,
} from './lead.service';
import { BulkUploadSchema, LeadFilterSchema, LeadRowSchema } from './lead.model';

// POST /api/rm/leads/upload  – bulk upload
export async function bulkUploadLeads(req: Request, res: Response) {
  const parsed = BulkUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const result = await uploadLeads(parsed.data);
    return res.status(201).json(result);
  } catch (err) {
    console.error('bulkUploadLeads error:', err);
    return res.status(500).json({ error: 'Failed to upload leads' });
  }
}

// POST /api/rm/leads  – single lead
export async function createLead(req: Request, res: Response) {
  const parsed = LeadRowSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const result = await uploadSingleLead(parsed.data);
    return res.status(201).json(result);
  } catch (err) {
    console.error('createLead error:', err);
    return res.status(500).json({ error: 'Failed to create lead' });
  }
}

// GET /api/rm/leads  – paginated list with optional ?status=HOT|WARM|COLD
export async function listLeads(req: Request, res: Response) {
  const parsed = LeadFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
  }

  try {
    const result = await getLeads(parsed.data);
    return res.json(result);
  } catch (err) {
    console.error('listLeads error:', err);
    return res.status(500).json({ error: 'Failed to fetch leads' });
  }
}

// GET /api/rm/leads/:id  – lead detail with call history
export async function getLeadDetails(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const lead = await getLeadDetail(id);
    return res.json(lead);
  } catch (err: any) {
    if (err.message === 'Lead not found') return res.status(404).json({ error: 'Lead not found' });
    console.error('getLeadDetails error:', err);
    return res.status(500).json({ error: 'Failed to fetch lead' });
  }
}

// GET /api/rm/analytics  – dashboard summary
export async function getAnalytics(req: Request, res: Response) {
  try {
    const data = await getDashboardAnalytics();
    return res.json(data);
  } catch (err) {
    console.error('getAnalytics error:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}

// GET /api/rm/calls/:callId/audio-chunks - signed audio chunks in sequence
export async function getCallAudioChunkList(req: Request, res: Response) {
  const { callId } = req.params;

  try {
    const result = await getCallAudioChunks(callId);
    return res.json(result);
  } catch (err: any) {
    if (err.message === 'Call not found') return res.status(404).json({ error: 'Call not found' });
    console.error('getCallAudioChunkList error:', err);
    return res.status(500).json({ error: 'Failed to fetch call audio chunks' });
  }
}
