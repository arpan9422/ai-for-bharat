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

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 shadow-sm border-l-4 ${color}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-1 leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
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

  const load = useCallback(async () => {
    try {
      setError('');
      const [a, h] = await Promise.all([
        fetchAnalytics(),
        fetchLeads({ status: 'HOT', limit: 8 }),
      ]);
      setAnalytics(a);
      setHotLeads(h.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = analytics ? analytics.leadCounts.HOT + analytics.leadCounts.WARM + analytics.leadCounts.COLD : 0;
  const conversionRate = total > 0 ? Math.round((analytics!.leadCounts.HOT / total) * 100) : 0;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
              className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-600 bg-white px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              📤 Bulk Upload
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-semibold shadow-sm">
              + Add Lead
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
            ⚠️ {error}
            <button onClick={load} className="ml-auto text-red-600 underline text-xs">Retry</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Leads" color="border-indigo-500"
            value={loading ? '—' : total} sub="All time" />
          <StatCard label="Hot Leads" color="border-red-500"
            value={loading ? '—' : analytics?.leadCounts.HOT ?? 0}
            sub={`Avg score: ${analytics?.avgScoreByStatus?.HOT ?? 0}`} />
          <StatCard label="Total Calls" color="border-emerald-500"
            value={loading ? '—' : analytics?.calls.totalCalls ?? 0}
            sub={`Avg: ${formatDuration(analytics?.calls.avgDuration?.duration ?? undefined)}`} />
          <StatCard label="Conversion Rate" color="border-amber-500"
            value={loading ? '—' : `${conversionRate}%`} sub="Hot / Total leads" />
        </div>

        {/* Middle row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Funnel */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Conversion Funnel</h2>
              <Link href="/leads" className="text-xs text-indigo-600 hover:underline">View all →</Link>
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

          {/* Recent calls with View buttons */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Recent Calls</h2>
              <Link href="/leads" className="text-xs text-indigo-600 hover:underline font-medium">View all →</Link>
            </div>
            {loading ? (
              <div className="p-4 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : analytics?.calls.recentCalls.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No calls yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {(analytics?.calls.recentCalls ?? []).map(call => (
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
                    </div>
                    <div className="text-right shrink-0 mr-3">
                      <span className={`text-base font-bold ${scoreColor(call.score)}`}>{call.score}</span>
                      <p className="text-xs text-gray-400">score</p>
                    </div>
                    <Link href="/leads" className="text-xs text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0">
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hot leads queue with View buttons */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span>🔥</span>
              <h2 className="text-sm font-semibold text-gray-700">Hot Lead Queue</h2>
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">{hotLeads.length} ready</span>
            </div>
            <Link href="/leads?status=HOT" className="text-xs text-indigo-600 hover:underline font-medium">View all →</Link>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : hotLeads.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
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
                  <div className="w-24 shrink-0">
                    <ScoreBar score={lead.score} />
                  </div>
                  <div className={`text-lg font-bold shrink-0 w-8 text-right ${scoreColor(lead.score)}`}>{lead.score}</div>
                  <Link href={`/leads/${lead.id}`}
                    className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 shadow-sm">
                    View Lead →
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
