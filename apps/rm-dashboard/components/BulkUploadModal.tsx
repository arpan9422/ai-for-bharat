'use client';
import { useState } from 'react';
import { bulkUploadLeads } from '@/lib/api';

interface Props {
  onClose: () => void;
  onUploaded: () => void;
}

const SAMPLE_CSV = `phone,name,language,occupation,background
+91 9876543210,Rajesh Kumar,hinglish,MFD,Financial services 5 years
+91 9123456789,Priya Sharma,hindi,insurance agent,LIC agent 3 years
+91 9988776655,Amit Patel,english,sub-broker,Stock market 8 years`;

export default function BulkUploadModal({ onClose, onUploaded }: Props) {
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ uploaded: number } | null>(null);

  const parseCsv = (text: string) => {
    const lines = text.trim().split('\n').filter(Boolean);
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { if (vals[i]) obj[h] = vals[i]; });
      if (!obj.phone) throw new Error('Each row must have a phone number');
      return obj;
    });
  };

  const submit = async () => {
    if (!csvText.trim()) { setError('Paste CSV data first'); return; }
    setLoading(true); setError('');
    try {
      const leads = parseCsv(csvText);
      const res = await bulkUploadLeads(leads as Parameters<typeof bulkUploadLeads>[0]);
      setResult({ uploaded: res.uploaded });
      onUploaded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Bulk Upload Leads</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {result && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              ✅ Successfully uploaded {result.uploaded} leads
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">CSV Data</label>
              <button
                onClick={() => setCsvText(SAMPLE_CSV)}
                className="text-xs text-indigo-600 hover:underline"
              >
                Load sample
              </button>
            </div>
            <textarea
              rows={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              placeholder={SAMPLE_CSV}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Required column: <code className="bg-gray-100 px-1 rounded">phone</code>. Optional: name, language, occupation, background
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={submit} disabled={loading}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? 'Uploading...' : 'Upload Leads'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
