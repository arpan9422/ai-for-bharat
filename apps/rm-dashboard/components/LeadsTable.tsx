'use client';
import Link from 'next/link';
import { Lead } from '@/lib/types';
import StatusBadge from './StatusBadge';
import ScoreBar from './ScoreBar';
import { formatShortDate, languageLabel, occupationLabel } from '@/lib/utils';

interface Props {
  leads: Lead[];
  loading?: boolean;
}

export default function LeadsTable({ leads, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">📋</div>
        <p className="font-medium text-gray-500">No leads found</p>
        <p className="text-sm mt-1">Add leads using the button above or upload a CSV</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Score</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Language</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Occupation</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Calls</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
            <th className="py-3 px-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {leads.map(lead => (
            <tr key={lead.id} className="hover:bg-gray-50/60 transition-colors group">
              <td className="py-3 px-4">
                <div className="font-medium text-gray-900">{lead.name || '—'}</div>
                <div className="text-xs text-gray-400 mt-0.5">{lead.phone}</div>
              </td>
              <td className="py-3 px-4">
                <StatusBadge status={lead.status} />
              </td>
              <td className="py-3 px-4 w-36">
                <ScoreBar score={lead.score} />
              </td>
              <td className="py-3 px-4 text-gray-600 text-xs">{languageLabel(lead.language)}</td>
              <td className="py-3 px-4 text-gray-600 text-xs">{occupationLabel(lead.occupation)}</td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  {lead._count?.calls ?? 0}
                </span>
              </td>
              <td className="py-3 px-4 text-xs text-gray-400">{formatShortDate(lead.createdAt)}</td>
              <td className="py-3 px-4">
                <Link
                  href={`/leads/${lead.id}`}
                  className="text-xs text-indigo-600 font-semibold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
