'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Lead } from '@/lib/types';
import StatusBadge from './StatusBadge';
import ScoreBar from './ScoreBar';
import { formatShortDate, languageLabel, occupationLabel } from '@/lib/utils';

type SortKey = 'createdAt' | 'score' | 'name' | 'id';
type SortDir = 'asc' | 'desc';

interface Props {
  leads: Lead[];
  loading?: boolean;
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  return (
    <span className="ml-1 inline-flex flex-col gap-0">
      <svg className={`w-2.5 h-2.5 ${sortKey === col && sortDir === 'asc' ? 'text-indigo-600' : 'text-gray-300'}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 0L10 6H0z" />
      </svg>
      <svg className={`w-2.5 h-2.5 ${sortKey === col && sortDir === 'desc' ? 'text-indigo-600' : 'text-gray-300'}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 6L0 0h10z" />
      </svg>
    </span>
  );
}

export default function LeadsTable({ leads, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...leads].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0;
    if (sortKey === 'createdAt') { av = a.createdAt; bv = b.createdAt; }
    else if (sortKey === 'score') { av = a.score; bv = b.score; }
    else if (sortKey === 'name') { av = a.name || ''; bv = b.name || ''; }
    else if (sortKey === 'id') { av = a.id; bv = b.id; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

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
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
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
            <th className="text-left py-3 px-4">
              <button onClick={() => toggleSort('name')} className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
                Lead <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </th>
            <th className="text-left py-3 px-4">
              <button onClick={() => toggleSort('id')} className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
                Lead ID <SortIcon col="id" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left py-3 px-4 w-36">
              <button onClick={() => toggleSort('score')} className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
                Score <SortIcon col="score" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Language</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Occupation</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Calls</th>
            <th className="text-left py-3 px-4">
              <button onClick={() => toggleSort('createdAt')} className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
                Added <SortIcon col="createdAt" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </th>
            <th className="py-3 px-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map(lead => (
            <tr key={lead.id} className="hover:bg-gray-50/60 transition-colors">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    lead.status === 'HOT' ? 'bg-red-100 text-red-600' :
                    lead.status === 'WARM' ? 'bg-amber-100 text-amber-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {(lead.name || lead.phone).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{lead.name || '—'}</div>
                    <div className="text-xs text-gray-400">{lead.phone}</div>
                  </div>
                </div>
              </td>
              <td className="py-3 px-4">
                <code className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{lead.id}</code>
              </td>
              <td className="py-3 px-4"><StatusBadge status={lead.status} /></td>
              <td className="py-3 px-4 w-36"><ScoreBar score={lead.score} /></td>
              <td className="py-3 px-4 text-gray-600 text-xs">{languageLabel(lead.language)}</td>
              <td className="py-3 px-4 text-gray-600 text-xs">{occupationLabel(lead.occupation)}</td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  {lead._count?.calls ?? 0}
                </span>
              </td>
              <td className="py-3 px-4 text-xs text-gray-400">{formatShortDate(lead.createdAt)}</td>
              <td className="py-3 px-4">
                <Link href={`/leads/${lead.id}`}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors">
                  View
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
