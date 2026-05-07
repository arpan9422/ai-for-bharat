'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchAnalytics, fetchLeads } from '@/lib/api';
import { Analytics, Lead } from '@/lib/types';
import FunnelChart from '@/components/FunnelChart';
import StatusBadge from '@/components/StatusBadge';
import ScoreBar from '@/components/ScoreBar';
import AddLeadModal from '@/components/AddLeadModal';
import BulkUploadModal from '@/components/BulkUploadModal';
import { formatDuration, formatShortDate, languageLabel, scoreColor } from '@/lib/utils';

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm border-l-4 ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1 leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [hotLeads, setHotLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [queueLeads, setQueueLeads] = useState<Lead[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueSearch, setQueueSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [a, h, q] = await Promise.all([
        fetchAnalytics(),
        fetchLeads({ status: 'HOT', limit: 8 }),
        fetchLeads({ callStatus: 'uncalled', limit: 500 }),
      ]);
      setAnalytics(a);
      setHotLeads(h.items);
      setQueueLeads(q.items);
      setQueueTotal(q.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const total = analytics ? analytics.leadCounts.HOT + analytics.leadCounts.WARM + analytics.leadCounts.COLD : 0;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const filteredQueueLeads = queueLeads.filter(lead => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return true;
    return `${lead.id} ${lead.name || ''} ${lead.phone} ${lead.occupation || ''}`.toLowerCase().includes(q);
  });

  return (
    <>
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onCreated={load} />}
      {showBulk && <BulkUploadModal onClose={() => setShowBulk(false)} onUploaded={load} />}

      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Overview</h1>
            <p className="text-sm text-gray-500 mt-0.5">{today}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(true)}
              className="inline-flex items-center gap-1.5 text-sm border border-gray-300 text-gray-600 bg-white px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
            </button>
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-semibold shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Lead
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
            <button onClick={load} className="ml-auto text-red-600 underline text-xs">Retry</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Leads" color="border-indigo-500"
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            value={loading ? '—' : total} sub="All time" />
          <StatCard label="Hot Leads" color="border-red-500"
            icon="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
            value={loading ? '—' : analytics?.leadCounts.HOT ?? 0}
            sub={`Avg score: ${analytics?.avgScoreByStatus?.HOT ?? 0}`} />
          <StatCard label="Total Calls" color="border-emerald-500"
            icon="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            value={loading ? '—' : analytics?.calls.totalCalls ?? 0}
            sub={`Avg: ${formatDuration(analytics?.calls.avgDuration?.duration ?? undefined)}`} />
        </div>

        {/* Not yet called queue */}
        <div className="bg-white rounded-xl border border-indigo-100 shadow-sm overflow-hidden">
          <div className="flex flex-col gap-3 px-5 py-4 border-b border-indigo-50 bg-indigo-50/40 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">Call Queue</h2>
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                  {loading ? '...' : `${queueTotal} pending`}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Leads with no call history. Search by name, phone, or lead ID.</p>
            </div>
            <div className="relative w-full sm:w-80">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
              </svg>
              <input
                value={queueSearch}
                onChange={event => setQueueSearch(event.target.value)}
                placeholder="Search queue"
                className="w-full rounded-lg border border-indigo-100 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          ) : filteredQueueLeads.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {queueSearch ? 'No queued leads match this search' : 'No uncalled leads in queue'}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {filteredQueueLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-black text-indigo-700">
                    {(lead.name || lead.phone).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{lead.name || 'Unnamed lead'}</p>
                      <span className="text-xs text-gray-300">·</span>
                      <p className="text-xs text-gray-500">{lead.phone}</p>
                    </div>
                    <code className="mt-1 inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{lead.id}</code>
                  </div>
                  <Link href={`/leads/${lead.id}`} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Middle row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Funnel */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Conversion Funnel</h2>
              <Link href="/leads" className="text-xs text-indigo-600 hover:underline font-medium">View all</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : (
              <FunnelChart hot={analytics?.leadCounts.HOT ?? 0} warm={analytics?.leadCounts.WARM ?? 0} cold={analytics?.leadCounts.COLD ?? 0} />
            )}
            {!loading && analytics && (
              <div className="mt-4 grid grid-cols-3 gap-2 pt-4 border-t border-gray-100">
                {(['HOT', 'WARM', 'COLD'] as const).map(s => (
                  <Link key={s} href={`/leads?status=${s}`} className="text-center p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="text-xl font-bold text-gray-900">{analytics.leadCounts[s]}</div>
                    <StatusBadge status={s} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Recent Calls</h2>
              <Link href="/leads" className="text-xs text-indigo-600 hover:underline font-medium">View all</Link>
            </div>
            {loading ? (
              <div className="p-4 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : !analytics?.calls.recentCalls.length ? (
              <div className="text-center py-10 text-gray-400 text-sm">No calls yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {analytics.calls.recentCalls.map(call => (
                  <div key={call.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                      {(call.lead.name || call.lead.phone).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{call.lead.name || call.lead.phone}</span>
                        <StatusBadge status={call.lead.status} />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {languageLabel(call.language)} · {formatDuration(call.duration)} · {formatShortDate(call.startedAt)}
                      </div>
                      <code className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">{call.lead.id}</code>
                    </div>
                    <div className="text-right shrink-0 mr-3">
                      <span className={`text-base font-bold ${scoreColor(call.score)}`}>{call.score}</span>
                      <p className="text-xs text-gray-400">score</p>
                    </div>
                    <Link href={`/leads/${call.lead.id}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0">
                      View
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hot leads queue */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <h2 className="text-sm font-semibold text-gray-700">Hot Lead Queue</h2>
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">{hotLeads.length} ready</span>
            </div>
            <Link href="/leads?status=HOT" className="text-xs text-indigo-600 hover:underline font-medium">View all</Link>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : hotLeads.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-2 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-sm">No hot leads yet — AI agent will populate this automatically</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {hotLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-sm font-bold text-red-600 shrink-0">
                    {(lead.name || lead.phone).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{lead.name || '—'}</span>
                      <span className="text-xs text-gray-400">{lead.phone}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {lead.occupation || 'Unknown'} · {lead.language || '—'} · {lead._count?.calls ?? 0} call(s)
                    </div>
                  </div>
                  <div className="w-24 shrink-0"><ScoreBar score={lead.score} /></div>
                  <div className={`text-lg font-bold shrink-0 w-8 text-right ${scoreColor(lead.score)}`}>{lead.score}</div>
                  <Link href={`/leads/${lead.id}`}
                    className="inline-flex items-center gap-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 shadow-sm">
                    View Lead
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
