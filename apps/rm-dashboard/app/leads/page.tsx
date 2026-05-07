'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchLeads } from '@/lib/api';
import { Lead, LeadStatus } from '@/lib/types';
import LeadsTable from '@/components/LeadsTable';
import AddLeadModal from '@/components/AddLeadModal';
import BulkUploadModal from '@/components/BulkUploadModal';

const FILTERS: { label: string; value: string; color: string }[] = [
  { label: 'All Leads', value: '',     color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { label: 'Hot',       value: 'HOT',  color: 'bg-red-50 text-red-700 border-red-200' },
  { label: 'Warm',      value: 'WARM', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Cold',      value: 'COLD', color: 'bg-blue-50 text-blue-700 border-blue-200' },
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
  const [queueLeads, setQueueLeads] = useState<Lead[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);

  const LIMIT = 20;

  const load = useCallback(async (p = 1) => {
    setLoading(true); setError('');
    try {
      setQueueLoading(true);
      const [res, queue] = await Promise.all([
        fetchLeads({
          status: statusParam as LeadStatus | undefined || undefined,
          page: p, limit: LIMIT,
        }),
        fetchLeads({ callStatus: 'uncalled', page: 1, limit: 8 }),
      ]);
      setLeads(res.items);
      setTotal(res.total);
      setPage(p);
      setQueueLeads(queue.items);
      setQueueTotal(queue.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
      setQueueLoading(false);
    }
  }, [statusParam]);

  useEffect(() => {
    void Promise.resolve().then(() => load(1));
  }, [load]);

  const totalPages = Math.ceil(total / LIMIT);

  const setFilter = (val: string) => {
    const params = new URLSearchParams();
    if (val) params.set('status', val);
    router.push(`/leads${params.toString() ? `?${params}` : ''}`);
  };

  return (
    <>
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onCreated={() => load(1)} />}
      {showBulk && <BulkUploadModal onClose={() => setShowBulk(false)} onUploaded={() => load(1)} />}

      <div className="space-y-5 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? 'Loading…' : `${total} leads · Page ${page} of ${totalPages || 1}`}
            </p>
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
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Not yet called queue */}
        <div className="bg-white rounded-xl border border-indigo-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-50 bg-indigo-50/40">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Call Queue</h2>
              <p className="text-xs text-gray-500 mt-0.5">New leads with no call history. Use these IDs in the test pipeline.</p>
            </div>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
              {queueLoading ? '...' : `${queueTotal} pending`}
            </span>
          </div>

          <div className="divide-y divide-gray-50">
            {queueLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
              </div>
            ) : queueLeads.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No uncalled leads in queue</div>
            ) : (
              queueLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-black text-indigo-700">
                    {(lead.name || lead.phone).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
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
              ))
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1">Filter:</span>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                statusParam === f.value
                  ? f.value === 'HOT' ? 'bg-red-500 text-white border-red-500 shadow-sm'
                    : f.value === 'WARM' ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : f.value === 'COLD' ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                    : 'bg-gray-700 text-white border-gray-700 shadow-sm'
                  : f.color
              }`}>
              {f.value === 'HOT' && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                </svg>
              )}
              {f.value === 'WARM' && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
              {f.value === 'COLD' && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4">
            <LeadsTable leads={leads} loading={loading} />
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => load(page - 1)} disabled={page === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-all font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Prev
                </button>
                <span className="px-3 py-1.5 text-xs text-gray-600 font-bold bg-white border border-gray-200 rounded-lg">
                  {page} / {totalPages}
                </span>
                <button onClick={() => load(page + 1)} disabled={page === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-all font-medium">
                  Next
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
    <Suspense fallback={<div className="h-96 bg-gray-100 rounded-xl animate-pulse" />}>
      <LeadsContent />
    </Suspense>
  );
}
