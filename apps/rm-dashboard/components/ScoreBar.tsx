'use client';
import { scoreBarColor, scoreColor } from '@/lib/utils';

export default function ScoreBar({ score, showLabel = true }: { score: number; showLabel?: boolean }) {
  const pct = Math.min(Math.max(score, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-bold tabular-nums w-7 text-right ${scoreColor(score)}`}>
          {score}
        </span>
      )}
    </div>
  );
}
