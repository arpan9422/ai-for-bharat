import { Analytics, Lead, LeadDetail, LeadsResponse } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

// Analytics
export function fetchAnalytics(): Promise<Analytics> {
  return apiFetch<Analytics>('/api/rm/analytics');
}

// Leads
export function fetchLeads(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<LeadsResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<LeadsResponse>(`/api/rm/leads${query}`);
}

export function fetchLeadDetail(id: string): Promise<LeadDetail> {
  return apiFetch<LeadDetail>(`/api/rm/leads/${id}`);
}

export function createLead(data: {
  phone: string;
  name?: string;
  language?: string;
  occupation?: string;
  background?: string;
  callScript?: string;
}): Promise<Lead> {
  return apiFetch<Lead>('/api/rm/leads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function bulkUploadLeads(leads: typeof createLead extends (d: infer D) => unknown ? D[] : never): Promise<{ uploaded: number; leads: Lead[] }> {
  return apiFetch('/api/rm/leads/upload', {
    method: 'POST',
    body: JSON.stringify({ leads }),
  });
}

export function fetchConversation(conversationId: string) {
  return apiFetch<{
    conversation_id: string;
    lead: { id: string; name?: string; phone: string; status: string };
    transcript: Array<{ role: string; content: string; timestamp: number; language?: string; intent?: string; emotion?: string; score?: number }>;
    summary: Record<string, unknown> | null;
    score: number;
    duration?: number;
    language?: string;
    recording_url?: string;
    recording_chunks?: Array<{
      index: number;
      key: string;
      sizeBytes: number;
      mimeType: string;
      speaker?: 'agent' | 'user';
      text?: string;
      timestamp?: number;
      url: string | null;
    }>;
    started_at: string;
    ended_at?: string;
  }>(`/api/conversations/${conversationId}`);
}
