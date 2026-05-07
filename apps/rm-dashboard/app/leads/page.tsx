'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchLeads } from '@/lib/api';
import { Lead, LeadStatus } from '@/lib/types';
import LeadsTable from '@/components/LeadsTable';
import AddLeadModal from '@/components/AddLeadModal';
import BulkUploadModal from '@/components/BulkUploadModal';

const TABS: { label: string; value: string; icon: string; color: string }[] = [
  { label: 'All Leads', value: '', icon: '👥', color: '' },
  { label: 'Hot', value: 'HOT', icon: '🔥', color: 'text-red-600' },
  { label: 'Warm', value: 'WARM', icon: '🌡️', color: 'text-amber-600' },
  { label: 'Cold', value: 'COLD', icon: '❄️', color: 'text-blue-600' },
];

function LeadsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusParam = searchParams.get('status') || '';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const LIMIT = 20;

  const load = useCallback(async (p = 1) => {
    setLoading(true); setError('');
    try {
      const res = await fetchLeads({
        status: statusParam as LeadStatus | undefined || undefined,
        page: p,
        limit: LIMIT,
      });
      setLeads(res.items);
      setTotal(res.total);
      setPage(p);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [statusParam]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.ceil(total / LIMIT);

  const setTab = (val: string) => {
    const params = new URLSearchParams();
    if (val) params.set('status', val);
    router.push(`/leads${params.toString() ? `?${params}` : ''}`);
  };

  const activeTab = TABS.find(t => t.value === statusParam) ?? TABS[0];

  return (
    <>
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onCreated={() => load(1)} />}
      {showBulk && <BulkUploadModal onClose={() => setShowBulk(false)} onUploaded={() => load(1)} />}

      <div className="space-y-5 max-w-7xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Leads</h1>
            <p className="text-sm text-slate-400 mt-1 font-medium">
              {loading ? 'Loading…' : `${total} ${activeTab.label.toLowerCase()} · Page ${page} of ${totalPages || 1}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-600 bg-white px-4 py-2 rounded-xl hover:bg-slate-50 hover:shadow-sm transition-all font-medium"
            >
              📤 Bulk Upload
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors font-semibold shadow-sm shadow-indigo-200"
            >
              + Add Lead
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
            <button onClick={() => load(1)} className="ml-auto text-red-600 underline text-xs font-medium">Retry</button>
          </div>
        )}

        {/* Tabs + Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            {TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setTab(tab.value)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  statusParam === tab.value
                    ? 'border-indigo-600 text-indigo-600 bg-white'
                    : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-white/60'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-4">
            <LeadsTable leads={leads} loading={loading} />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-50 bg-slate-50/30">
              <p className="text-xs text-slate-400 font-medium">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} leads
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white hover:shadow-sm transition-all font-medium"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs text-slate-600 font-bold bg-white border border-slate-200 rounded-lg">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white hover:shadow-sm transition-all font-medium"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4 max-w-7xl">
        <div className="h-10 w-48 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    }>
      <LeadsContent />
    </Suspense>
  );
}
