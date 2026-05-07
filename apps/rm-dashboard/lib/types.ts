export type LeadStatus = 'HOT' | 'WARM' | 'COLD';

export interface Lead {
  id: string;
  phone: string;
  name?: string;
  language?: string;
  background?: string;
  occupation?: string;
  score: number;
  status: LeadStatus;
  callScript?: string;
  createdAt: string;
  _count?: { calls: number };
}

export interface CallSummary {
  total_turns: number;
  final_score: number;
  engagement_level: string;
  handoff_occurred: boolean;
  handoff_reason?: string;
  end_reason?: string;
  detected_intents: string[];
  objections_count: number;
  duration_seconds: number;
}

export interface Call {
  id: string;
  score: number;
  scoreBreakdown?: Record<string, number>;
  duration?: number;
  language?: string;
  startedAt: string;
  endedAt?: string;
  summary?: CallSummary;
}

export interface LeadDetail extends Lead {
  calls: Call[];
  whatsappLogs: WhatsappLog[];
}

export interface WhatsappLog {
  id: string;
  leadId: string;
  message: string;
  status: string;
  sentAt: string;
}

export interface Analytics {
  leadCounts: { HOT: number; WARM: number; COLD: number };
  avgScoreByStatus: Record<string, number>;
  calls: {
    totalCalls: number;
    avgDuration: { duration: number | null; score: number | null };
    recentCalls: RecentCall[];
  };
}

export interface RecentCall {
  id: string;
  score: number;
  duration?: number;
  language?: string;
  startedAt: string;
  endedAt?: string;
  lead: { name?: string; phone: string; status: LeadStatus };
}

export interface LeadsResponse {
  items: Lead[];
  total: number;
  page: number;
  limit: number;
}
