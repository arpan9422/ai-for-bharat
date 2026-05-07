'use client';

interface Props { hot: number; warm: number; cold: number; }

export default function FunnelChart({ hot, warm, cold }: Props) {
  const total = hot + warm + cold || 1;
  const stages = [
    { label: 'Total Contacted', count: total, pct: 100, color: 'bg-gray-300' },
    { label: 'Engaged (Warm + Hot)', count: hot + warm, pct: Math.round(((hot + warm) / total) * 100), color: 'bg-amber-400' },
    { label: 'Hot (Ready to Convert)', count: hot, pct: Math.round((hot / total) * 100), color: 'bg-red-500' },
  ];
  return (
    <div className="space-y-3">
      {stages.map(s => (
        <div key={s.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-gray-600">{s.label}</span>
            <span className="text-gray-500">{s.count} <span className="text-gray-400">({s.pct}%)</span></span>
          </div>
          <div className="h-5 bg-gray-100 rounded-md overflow-hidden">
            <div className={`h-full rounded-md transition-all duration-700 ${s.color}`} style={{ width: `${s.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
