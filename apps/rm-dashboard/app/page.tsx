'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchAnalytics, fetchLeads } from '@/lib/api';
import { Analytics, Lead } from '@/lib/types';
import StatCard from '@/components/StatCard';
import FunnelChart from '@/components/FunnelChart';
import RecentCallsList from '@/components/RecentCallsList';
import LeadsTable from '@/components/LeadsTable';
import StatusBadge from '@/components/StatusBadge';
import ScoreBar from '@/components/ScoreBar';
import AddLeadModal from '@/components/AddLeadModal';
import BulkUploadModal from '@/components/BulkUploadModal';
import { formatDuration, scoreColor } from '@/lib/utils';

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
        fetchLeads({ status: 'HOT', limit: 5 }),
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

  const total = analytics
    ? analytics.leadCounts.HOT + analytics.leadCounts.WARM + analytics.leadCounts.COLD
    : 0;

  const conversionRate = total > 0
    ? Math.round((analytics!.leadCounts.HOT / total) * 100)
    : 0;

  return (
    <>
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onCreated={load} />}
      {showBulk && <BulkUploadModal onClose={() => setShowBulk(false)} onUploaded={load} />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">AI Voice Agent — Partner Lead Conversion</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3 py-2 rounded-xl hover:bg-white hover:shadow-sm transition-all font-medium"
            >
              📤 Bulk Upload
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm"
            >
              + Add Lead
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
            <button onClick={load} className="ml-auto text-red-600 underline text-xs">Retry</button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon="👥" label="Total Leads" color="bg-indigo-50 text-indigo-600"
            value={loading ? '—' : total}
            sub="All time"
          />
          <StatCard
            icon="🔥" label="Hot Leads" color="bg-red-50 text-red-600"
            value={loading ? '—' : analytics?.leadCounts.HOT ?? 0}
            sub={`Avg score: ${analytics?.avgScoreByStatus?.HOT ?? 0}`}
          />
          <StatCard
            icon="📞" label="Total Calls" color="bg-green-50 text-green-600"
            value={loading ? '—' : analytics?.calls.totalCalls ?? 0}
            sub={`Avg: ${formatDuration(analytics?.calls.avgDuration?.duration ?? undefined)}`}
          />
          <StatCard
            icon="📈" label="Conversion Rate" color="bg-amber-50 text-amber-600"
            value={loading ? '—' : `${conversionRate}%`}
            sub="Hot / Total leads"
          />
        </div>

        {/* Middle row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Funnel */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Conversion Funnel</h2>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <FunnelChart
                hot={analytics?.leadCounts.HOT ?? 0}
                warm={analytics?.leadCounts.WARM ?? 0}
                cold={analytics?.leadCounts.COLD ?? 0}
              />
            )}

            {/* Status breakdown */}
            {!loading && analytics && (
              <div className="mt-5 grid grid-cols-3 gap-2 pt-4 border-t border-gray-50">
                {(['HOT', 'WARM', 'COLD'] as const).map(s => (
                  <Link key={s} href={`/leads?status=${s}`} className="text-center hover:bg-gray-50 rounded-xl p-2 transition-colors">
                    <div className="text-xl font-bold text-gray-900">{analytics.leadCounts[s]}</div>
                    <StatusBadge status={s} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Recent Calls</h2>
              <Link href="/leads" className="text-xs text-indigo-600 hover:underline">View all →</Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <RecentCallsList calls={analytics?.calls.recentCalls ?? []} />
            )}
          </div>
        </div>

        {/* Hot leads queue */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <h2 className="text-sm font-semibold text-gray-900">Hot Lead Queue</h2>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                {hotLeads.length} ready
              </span>
            </div>
            <Link href="/leads?status=HOT" className="text-xs text-indigo-600 hover:underline">View all →</Link>
          </div>

          {loading ? (
            <div className="p-5 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : hotLeads.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">No hot leads yet — calls will appear here automatically</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {hotLeads.map(lead => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-sm font-bold text-red-600 shrink-0">
                    {(lead.name || lead.phone).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{lead.name || '—'}</span>
                      <span className="text-xs text-gray-400">{lead.phone}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {lead.occupation || 'Unknown'} · {lead.language || '—'} · {lead._count?.calls ?? 0} call(s)
                    </div>
                  </div>
                  <div className="w-28 shrink-0">
                    <ScoreBar score={lead.score} />
                  </div>
                  <div className={`text-lg font-bold shrink-0 ${scoreColor(lead.score)}`}>
                    {lead.score}
                  </div>
                  <span className="text-xs text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    View →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
