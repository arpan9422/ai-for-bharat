'use client';
import { LeadStatus } from '@/lib/types';
import { statusColor } from '@/lib/utils';

export default function StatusBadge({ status }: { status: LeadStatus }) {
  const c = statusColor(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}
