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
    <div className="space-y-2">
      {calls.map(call => (
        <div key={call.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
            {(call.lead.name || call.lead.phone).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900 truncate">
                {call.lead.name || call.lead.phone}
              </span>
              <StatusBadge status={call.lead.status} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
              <span>{languageLabel(call.language)}</span>
              <span>·</span>
              <span>{formatDuration(call.duration)}</span>
              <span>·</span>
              <span>{formatShortDate(call.startedAt)}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-lg font-bold ${scoreColor(call.score)}`}>{call.score}</span>
            <p className="text-xs text-gray-400">score</p>
          </div>
        </div>
      ))}
    </div>
  );
}
