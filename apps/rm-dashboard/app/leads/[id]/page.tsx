'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchLeadDetail, fetchConversation } from '@/lib/api';
import { LeadDetail, Call } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import ScoreBar from '@/components/ScoreBar';
import TranscriptViewer from '@/components/TranscriptViewer';
import ConversationPlayer from '@/components/ConversationPlayer';
import {
  formatDate, formatDuration, languageLabel,
  occupationLabel, scoreColor,
} from '@/lib/utils';

// Typed summary shape — handles both old and new schema
interface SummaryShape {
  totalTurns?: number;
  total_turns?: number;
  finalScore?: number;
  final_score?: number;
  objectionsRaised?: string[];
  objections_count?: number;
  engagementLevel?: string;
  engagement_level?: string;
  keyPoints?: string[];
  statedIntent?: string | null;
  rmOpener?: string;
  whatsappMessage?: string | null;
  handoff_occurred?: boolean;
  handoffOccurred?: boolean;
  handoffReason?: string | null;
  handoff_reason?: string;
  endReason?: string | null;
  end_reason?: string;
}

function CallSummaryPanel({ summary }: { summary: SummaryShape }) {
  const turns = summary.totalTurns ?? summary.total_turns ?? 0;
  const score = summary.finalScore ?? summary.final_score ?? 0;
  const objCount = summary.objectionsRaised?.length ?? summary.objections_count ?? 0;
  const engagement = summary.engagementLevel ?? summary.engagement_level ?? '';
  const handoffOccurred = summary.handoffOccurred ?? summary.handoff_occurred ?? false;
  const handoffReason = summary.handoffReason ?? summary.handoff_reason ?? summary.endReason ?? summary.end_reason ?? '';

  return (
    <div className="space-y-4 mb-5 pb-5 border-b border-slate-100">
      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Turns', value: turns, color: 'text-slate-900' },
          { label: 'Score', value: score, color: scoreColor(score) },
          { label: 'Objections', value: objCount, color: 'text-slate-900' },
          { label: 'Engagement', value: engagement || '—', color: 'text-slate-900', small: true },
        ].map(m => (
          <div key={m.label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
            <div className={`${m.small ? 'text-sm' : 'text-2xl'} font-black ${m.color} capitalize`}>{m.value}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Key points */}
      {summary.keyPoints && summary.keyPoints.length > 0 && (
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">📋 Key Points</p>
          <ul className="space-y-1.5">
            {summary.keyPoints.map((pt, i) => (
              <li key={i} className="text-sm text-indigo-900 flex gap-2">
                <span className="text-indigo-300 shrink-0 mt-0.5">•</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Objections raised */}
      {summary.objectionsRaised && summary.objectionsRaised.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">⚠️ Objections Raised</p>
          <div className="flex flex-wrap gap-2">
            {summary.objectionsRaised.map((obj, i) => (
              <span key={i} className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg font-medium">{obj}</span>
            ))}
          </div>
        </div>
      )}

      {/* Stated intent */}
      {summary.statedIntent && (
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">💬 Lead&apos;s Stated Intent</p>
          <p className="text-sm text-emerald-900 italic">&quot;{summary.statedIntent}&quot;</p>
        </div>
      )}

      {/* RM opener */}
      {summary.rmOpener && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">🎯 Suggested RM Opener</p>
          <p className="text-sm text-slate-800 italic">&quot;{summary.rmOpener}&quot;</p>
        </div>
      )}

      {/* WhatsApp message */}
      {summary.whatsappMessage && (
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">📱 WhatsApp Message (Ready to Send)</p>
          <pre className="text-xs text-emerald-900 whitespace-pre-wrap font-sans leading-relaxed">{summary.whatsappMessage}</pre>
        </div>
      )}

      {/* Handoff */}
      {handoffOccurred && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-800 font-medium">
          🚨 <strong>Handoff triggered</strong>{handoffReason ? ` — ${handoffReason}` : ''}
        </div>
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

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    if (!selectedCall) return;
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setCallLoading(true);
      fetchConversation(selectedCall)
        .then(data => {
          if (!cancelled) setCallDetail(data);
        })
        .catch(() => {
          if (!cancelled) setCallDetail(null);
        })
        .finally(() => {
          if (!cancelled) setCallLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCall]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-7xl">
        <div className="h-8 w-48 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-4 font-medium">{error || 'Lead not found'}</p>
        <button onClick={() => router.back()} className="text-indigo-600 hover:underline text-sm font-medium">← Go back</button>
      </div>
    );
  }

  const summary = callDetail?.summary as SummaryShape | null;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/leads" className="hover:text-slate-700 font-medium transition-colors">Leads</Link>
        <span>/</span>
        <span className="text-slate-700 font-semibold">{lead.name || lead.phone}</span>
      </div>

      {/* Lead profile card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 ${
            lead.status === 'HOT' ? 'bg-red-100 text-red-600' :
            lead.status === 'WARM' ? 'bg-amber-100 text-amber-600' :
            'bg-blue-100 text-blue-600'
          }`}>
            {(lead.name || lead.phone).charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900">{lead.name || '—'}</h1>
              <StatusBadge status={lead.status} />
            </div>
            <p className="text-slate-400 text-sm mt-1 font-medium">{lead.phone}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              {[
                { label: 'Language', value: languageLabel(lead.language) },
                { label: 'Occupation', value: occupationLabel(lead.occupation) },
                { label: 'Total Calls', value: String(lead.calls.length) },
                { label: 'Added', value: formatDate(lead.createdAt) },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{f.label}</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className={`text-5xl font-black ${scoreColor(lead.score)}`}>{lead.score}</div>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">/ 100</p>
            <div className="w-24 mt-2">
              <ScoreBar score={lead.score} showLabel={false} />
            </div>
          </div>
        </div>

        {lead.background && (
          <div className="mt-4 pt-4 border-t border-slate-50">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Background</p>
            <p className="text-sm text-slate-600">{lead.background}</p>
          </div>
        )}

        {lead.status === 'HOT' && (
          <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
            <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">🔥 RM Action Required</p>
            <p className="text-sm text-red-800">
              This lead is hot and ready to convert. See the suggested RM opener in the call summary below.
            </p>
          </div>
        )}

        {lead.status === 'WARM' && (
          <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">🌡️ WhatsApp Follow-up</p>
            <p className="text-sm text-amber-800">
              Send the pre-written WhatsApp message from the call summary below.
            </p>
          </div>
        )}
      </div>

      {/* Calls + Transcript */}
      {lead.calls.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Call list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Call History</h2>
            <div className="space-y-2">
              {lead.calls.map((call: Call) => {
                const cs = call.summary as SummaryShape | null;
                const csTurns = cs?.totalTurns ?? cs?.total_turns;
                const csObjs = cs?.objectionsRaised?.length ?? cs?.objections_count;
                return (
                  <button
                    key={call.id}
                    onClick={() => setSelectedCall(call.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedCall === call.id
                        ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-black ${scoreColor(call.score)}`}>{call.score}</span>
                      <span className="text-xs text-slate-400 font-medium">{formatDuration(call.duration)}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{formatDate(call.startedAt)}</div>
                    {cs && (
                      <div className="text-xs text-slate-400 mt-1">
                        {csTurns != null ? `${csTurns} turns` : ''}
                        {csObjs != null ? ` · ${csObjs} objections` : ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {lead.whatsappLogs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">WhatsApp</h3>
                {lead.whatsappLogs.map(log => (
                  <div key={log.id} className="text-xs text-slate-600 bg-emerald-50 rounded-lg p-2 mb-1 border border-emerald-100">
                    <span className="text-emerald-600 font-semibold">✓ Sent</span> · {formatDate(log.sentAt)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call detail + transcript */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            {callLoading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : callDetail ? (
              <>
                {summary && <CallSummaryPanel summary={summary} />}

                {/* Full call recording from ordered audio chunks */}
                <div className="mb-5">
                  {selectedCall ? (
                    <ConversationPlayer callId={selectedCall} />
                  ) : callDetail?.recording_url ? (
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">🎙</span>
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Call Recording</p>
                      </div>
                      <p className="text-xs text-indigo-500 mb-3">Full recording for this call</p>
                      <audio controls className="w-full" src={callDetail.recording_url}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
                      <p className="text-sm text-gray-400">No recording available</p>
                      <p className="text-xs text-gray-300 mt-1">Recording is generated after the call ends</p>
                    </div>
                  )}
                </div>

                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Transcript</h3>
                <TranscriptViewer
                  messages={(callDetail.transcript as Array<{
                    role: string; content: string; timestamp: number;
                    language?: string; intent?: string; emotion?: string; score?: number;
                  }>) || []}
                />
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <div className="text-3xl mb-2">📋</div>
                <p className="text-sm font-medium">Select a call to view transcript</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-slate-400">
          <div className="text-4xl mb-3">📞</div>
          <p className="font-bold text-slate-500">No calls yet</p>
          <p className="text-sm mt-1">This lead hasn&apos;t been contacted by the AI agent yet</p>
        </div>
      )}
    </div>
  );
}
