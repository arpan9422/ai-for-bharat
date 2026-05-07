'use client';

interface Props {
  hot: number;
  warm: number;
  cold: number;
}

export default function FunnelChart({ hot, warm, cold }: Props) {
  const total = hot + warm + cold || 1;
  const stages = [
    { label: 'Contacted', count: total, color: 'bg-gray-200', pct: 100 },
    { label: 'Engaged (Warm+Hot)', count: hot + warm, color: 'bg-amber-400', pct: Math.round(((hot + warm) / total) * 100) },
    { label: 'Hot Leads', count: hot, color: 'bg-red-500', pct: Math.round((hot / total) * 100) },
  ];

  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <div key={s.label}>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="font-medium text-gray-700">{s.label}</span>
            <span>{s.count} <span className="text-gray-400">({s.pct}%)</span></span>
          </div>
          <div className="h-6 bg-gray-100 rounded-lg overflow-hidden">
            <div
              className={`h-full rounded-lg transition-all duration-700 ${s.color}`}
              style={{ width: `${s.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
