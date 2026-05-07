'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchLeads } from '@/lib/api';
import { Lead, LeadStatus } from '@/lib/types';
import LeadsTable from '@/components/LeadsTable';
import AddLeadModal from '@/components/AddLeadModal';
import BulkUploadModal from '@/components/BulkUploadModal';

const TABS: { label: string; value: string; icon: string }[] = [
  { label: 'All', value: '', icon: '👥' },
  { label: 'Hot', value: 'HOT', icon: '🔥' },
  { label: 'Warm', value: 'WARM', icon: '🌡️' },
  { label: 'Cold', value: 'COLD', icon: '❄️' },
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

  return (
    <>
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onCreated={() => load(1)} />}
      {showBulk && <BulkUploadModal onClose={() => setShowBulk(false)} onUploaded={() => load(1)} />}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} total leads</p>
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
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            {TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setTab(tab.value)}
                className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  statusParam === tab.value
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            <LeadsTable leads={leads} loading={loading} />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs text-gray-600 font-medium">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
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
    <Suspense fallback={<div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />}>
      <LeadsContent />
    </Suspense>
  );
}
