'use client';
import Link from 'next/link';
import { RecentCall } from '@/lib/types';
import StatusBadge from './StatusBadge';
import { formatDuration, formatShortDate, languageLabel, scoreColor } from '@/lib/utils';

export default function RecentCallsList({ calls }: { calls: RecentCall[] }) {
  if (!calls.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <div className="text-3xl mb-2">📞</div>
        <p className="text-sm">No calls yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-50">
      {calls.map(call => (
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
          <div className="text-right shrink-0 mr-2">
            <span className={`text-base font-bold ${scoreColor(call.score)}`}>{call.score}</span>
            <p className="text-xs text-gray-400">score</p>
          </div>
          <Link href="/leads" className="text-xs text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0">
            View →
          </Link>
        </div>
      ))}
    </div>
  );
}
