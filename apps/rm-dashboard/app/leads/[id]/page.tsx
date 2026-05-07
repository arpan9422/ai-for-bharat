'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchLeadDetail, fetchConversation } from '@/lib/api';
import { LeadDetail, Call } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import ScoreBar from '@/components/ScoreBar';
import TranscriptViewer from '@/components/TranscriptViewer';
import { formatDate, formatDuration, languageLabel, occupationLabel, scoreColor } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SummaryShape {
  totalTurns?: number; total_turns?: number;
  finalScore?: number; final_score?: number;
  objectionsRaised?: string[]; objections_count?: number;
  engagementLevel?: string; engagement_level?: string;
  keyPoints?: string[];
  statedIntent?: string | null;
  rmOpener?: string;
  whatsappMessage?: string | null;
  handoff_occurred?: boolean; handoffOccurred?: boolean;
  handoffReason?: string | null; handoff_reason?: string;
  endReason?: string | null; end_reason?: string;
}

function CallSummaryPanel({ summary }: { summary: SummaryShape }) {
  const turns = summary.totalTurns ?? summary.total_turns ?? 0;
  const score = summary.finalScore ?? summary.final_score ?? 0;
  const objCount = summary.objectionsRaised?.length ?? summary.objections_count ?? 0;
  const engagement = summary.engagementLevel ?? summary.engagement_level ?? '';
  const handoffOccurred = summary.handoffOccurred ?? summary.handoff_occurred ?? false;
  const handoffReason = summary.handoffReason ?? summary.handoff_reason ?? summary.endReason ?? summary.end_reason ?? '';

  return (
    <div className="space-y-3 mb-5 pb-5 border-b border-gray-100">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Turns', value: turns, color: 'text-gray-900' },
          { label: 'Score', value: score, color: scoreColor(score) },
          { label: 'Objections', value: objCount, color: 'text-gray-900' },
          { label: 'Engagement', value: engagement, color: 'text-gray-900', small: true },
        ].map((m, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
            <div className={`font-bold ${m.small ? 'text-sm' : 'text-xl'} ${m.color} capitalize`}>{m.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {summary.keyPoints && summary.keyPoints.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>📋</span> Key Points
          </p>
          <ul className="space-y-1.5">
            {summary.keyPoints.map((pt, i) => (
              <li key={i} className="text-sm text-blue-900 flex gap-2 leading-relaxed">
                <span className="text-blue-400 shrink-0 mt-0.5">▸</span><span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.objectionsRaised && summary.objectionsRaised.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">⚠️ Objections Raised</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.objectionsRaised.map((obj, i) => (
              <span key={i} className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium border border-amber-200">{obj}</span>
            ))}
          </div>
        </div>
      )}

      {summary.statedIntent && (
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1.5">💬 Lead&apos;s Stated Intent</p>
          <p className="text-sm text-emerald-900 italic leading-relaxed">&quot;{summary.statedIntent}&quot;</p>
        </div>
      )}

      {summary.rmOpener && (
        <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
          <p className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-1.5">🎯 Suggested RM Opener</p>
          <p className="text-sm text-violet-900 italic leading-relaxed">&quot;{summary.rmOpener}&quot;</p>
        </div>
      )}

      {summary.whatsappMessage && (
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">📱 WhatsApp Message</p>
          <pre className="text-xs text-green-900 whitespace-pre-wrap font-sans leading-relaxed">{summary.whatsappMessage}</pre>
        </div>
      )}

      {handoffOccurred && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <span className="text-base">🚨</span>
          <span><strong>Handoff triggered</strong>{handoffReason ? ` — ${handoffReason}` : ''}</span>
        </div>
      )}
    </div>
  );
}

function RecordingPlayer({ conversationId, recordingUrl }: { conversationId: string; recordingUrl?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadRecording = async () => {
    if (url) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/conversations/${conversationId}/recording`);
      if (!res.ok) throw new Error('Recording not available');
      const data = await res.json();
      setUrl(data.recording_url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load recording');
    } finally {
      setLoading(false);
    }
  };

  if (!recordingUrl) return null;

  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
          <span>🎙️</span> Call Recording
        </p>
        {!url && !loading && (
          <button
            onClick={loadRecording}
            className="text-xs text-indigo-600 font-medium hover:underline"
          >
            Load Recording
          </button>
        )}
      </div>
      {loading && <div className="h-8 bg-gray-200 rounded animate-pulse" />}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {url && (
        <audio controls className="w-full h-10" src={url}>
          Your browser does not support audio playback.
        </audio>
      )}
    </div>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [callDetail, setCallDetail] = useState<Awaited<ReturnType<typeof fetchConversation>> | null>(null);
  const [callLoading, setCallLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary');

  const load = useCallback(async () => {
    try {
      const data = await fetchLeadDetail(id);
      setLead(data);
      if (data.calls.length > 0) setSelectedCall(data.calls[0].id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load lead');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedCall) return;
    setCallLoading(true);
    setActiveTab('summary');
    fetchConversation(selectedCall)
      .then(setCallDetail)
      .catch(() => setCallDetail(null))
      .finally(() => setCallLoading(false));
  }, [selectedCall]);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 rounded-lg" />
      <div className="h-44 bg-gray-200 rounded-2xl" />
      <div className="h-96 bg-gray-200 rounded-2xl" />
    </div>
  );

  if (error || !lead) return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">😕</div>
      <p className="text-red-600 mb-4 font-medium">{error || 'Lead not found'}</p>
      <button onClick={() => router.back()} className="text-indigo-600 hover:underline text-sm">← Go back</button>
    </div>
  );

  const summary = callDetail?.summary as SummaryShape | null;
  const selectedCallData = lead.calls.find((c: Call) => c.id === selectedCall);

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/leads" className="hover:text-gray-600 transition-colors">Leads</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{lead.name || lead.phone}</span>
      </div>

      {/* Lead profile card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Status bar */}
        <div className={`h-1.5 w-full ${lead.status === 'HOT' ? 'bg-red-500' : lead.status === 'WARM' ? 'bg-amber-400' : 'bg-blue-400'}`} />

        <div className="p-6">
          <div className="flex items-start gap-5">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0 ${
              lead.status === 'HOT' ? 'bg-red-100 text-red-600' :
              lead.status === 'WARM' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
            }`}>
              {(lead.name || lead.phone).charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{lead.name || '—'}</h1>
                <StatusBadge status={lead.status} />
              </div>
              <p className="text-gray-400 text-sm mt-1 font-mono">{lead.phone}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                {[
                  { label: 'Language', value: languageLabel(lead.language) },
                  { label: 'Occupation', value: occupationLabel(lead.occupation) },
                  { label: 'Total Calls', value: String(lead.calls.length) },
                  { label: 'Added', value: formatDate(lead.createdAt) },
                ].map((f, i) => (
                  <div key={i}>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{f.label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">{f.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className={`text-5xl font-black tabular-nums ${scoreColor(lead.score)}`}>{lead.score}</div>
              <p className="text-xs text-gray-400 mt-0.5">/ 100</p>
              <div className="w-24 mt-2"><ScoreBar score={lead.score} showLabel={false} /></div>
            </div>
          </div>

          {lead.background && (
            <div className="mt-5 pt-4 border-t border-gray-50">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Background</p>
              <p className="text-sm text-gray-700 leading-relaxed">{lead.background}</p>
            </div>
          )}

          {lead.status === 'HOT' && (
            <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3">
              <span className="text-xl shrink-0">🔥</span>
              <div>
                <p className="text-xs font-bold text-red-700 uppercase tracking-wider">RM Action Required</p>
                <p className="text-sm text-red-800 mt-1">Hot lead — ready to convert. Use the suggested RM opener below.</p>
              </div>
            </div>
          )}
          {lead.status === 'WARM' && (
            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
              <span className="text-xl shrink-0">📱</span>
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">WhatsApp Follow-up</p>
                <p className="text-sm text-amber-800 mt-1">Send the pre-written WhatsApp message from the call summary.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Calls section */}
      {lead.calls.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: call list + WhatsApp */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Call History</h2>
              <div className="space-y-2">
                {lead.calls.map((call: Call) => {
                  const cs = call.summary as SummaryShape | null;
                  const isSelected = selectedCall === call.id;
                  return (
                    <button
                      key={call.id}
                      onClick={() => setSelectedCall(call.id)}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                        isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-base font-bold tabular-nums ${scoreColor(call.score)}`}>{call.score}</span>
                        <span className="text-xs text-gray-400 font-medium">{formatDuration(call.duration)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{formatDate(call.startedAt)}</div>
                      {cs && (
                        <div className="text-xs text-gray-400 mt-1 flex gap-2">
                          {cs.totalTurns != null && <span>{cs.totalTurns} turns</span>}
                          {(cs.objectionsRaised?.length ?? 0) > 0 && <span>· {cs.objectionsRaised!.length} objections</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {lead.whatsappLogs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">WhatsApp Messages</h2>
                <div className="space-y-2">
                  {lead.whatsappLogs.map(log => (
                    <div key={log.id} className={`rounded-xl p-3 border ${log.status === 'SENT' ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-bold ${log.status === 'SENT' ? 'text-green-700' : 'text-amber-700'}`}>
                          {log.status === 'SENT' ? '✓ Sent' : '⏳ Pending'}
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(log.sentAt)}</span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">{log.message}</p>
                      {log.status === 'PENDING' && (
                        <button
                          onClick={async () => {
                            await fetch(`${API}/api/rm/whatsapp/${log.id}/send`, { method: 'POST' });
                            load();
                          }}
                          className="mt-2 w-full text-xs bg-green-600 text-white rounded-lg py-2 font-semibold hover:bg-green-700 transition-colors"
                        >
                          📱 Mark as Sent
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: call detail */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {callLoading ? (
              <div className="p-5 space-y-3 animate-pulse">
                {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
              </div>
            ) : callDetail ? (
              <>
                {/* Recording player */}
                {selectedCallData?.recordingUrl && (
                  <div className="px-5 pt-5">
                    <RecordingPlayer
                      conversationId={selectedCall!}
                      recordingUrl={selectedCallData.recordingUrl}
                    />
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-gray-100 px-5">
                  {(['summary', 'transcript'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors capitalize ${
                        activeTab === tab
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {tab === 'summary' ? '📊 Summary' : '💬 Transcript'}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {activeTab === 'summary' && summary && <CallSummaryPanel summary={summary} />}
                  {activeTab === 'summary' && !summary && (
                    <p className="text-sm text-gray-400 text-center py-8">No summary available for this call</p>
                  )}
                  {activeTab === 'transcript' && (
                    <TranscriptViewer
                      messages={(callDetail.transcript as Array<{
                        role: string; content: string; timestamp: number;
                        language?: string; intent?: string; emotion?: string; score?: number;
                      }>) || []}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="text-4xl mb-3">📞</div>
                <p className="text-sm">Select a call to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-5xl mb-4">📞</div>
          <p className="font-semibold text-gray-600">No calls yet</p>
          <p className="text-sm text-gray-400 mt-1">This lead hasn&apos;t been contacted by the AI agent yet</p>
        </div>
      )}
    </div>
  );
}
