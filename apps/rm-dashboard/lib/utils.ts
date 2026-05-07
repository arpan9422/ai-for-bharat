import { LeadStatus } from './types';

export function statusColor(status: LeadStatus) {
  switch (status) {
    case 'HOT':  return { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200' };
    case 'WARM': return { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200' };
    case 'COLD': return { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-400',   border: 'border-blue-200' };
  }
}

export function scoreColor(score: number) {
  if (score >= 75) return 'text-red-600';
  if (score >= 45) return 'text-amber-600';
  return 'text-blue-500';
}

export function scoreBarColor(score: number) {
  if (score >= 75) return 'bg-red-500';
  if (score >= 45) return 'bg-amber-500';
  return 'bg-blue-400';
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export function languageLabel(lang?: string | null): string {
  switch (lang) {
    case 'hindi':    return '🇮🇳 Hindi';
    case 'hinglish': return '🔀 Hinglish';
    case 'english':  return '🇬🇧 English';
    default:         return lang || '—';
  }
}

export function occupationLabel(occ?: string | null): string {
  if (!occ) return '—';
  const map: Record<string, string> = {
    mfd: 'MFD', distributor: 'Distributor',
    'insurance agent': 'Insurance Agent',
    'sub-broker': 'Sub-Broker', other: 'Other',
  };
  return map[occ.toLowerCase()] || occ;
}

export function intentLabel(intent?: string | null): string {
  if (!intent) return '';
  return intent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function emotionEmoji(emotion?: string | null): string {
  switch (emotion) {
    case 'positive':  return '😊';
    case 'negative':  return '😟';
    case 'confused':  return '😕';
    case 'neutral':   return '😐';
    default:          return '';
  }
}
