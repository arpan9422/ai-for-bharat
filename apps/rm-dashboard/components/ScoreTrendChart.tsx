'use client';

interface Message {
  role: string;
  content: string;
  timestamp: number;
  score?: number;
}

interface ScorePoint {
  turn: number;
  score: number;
  label: string;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

export default function ScoreTrendChart({ messages }: { messages: Message[] }) {
  const points: ScorePoint[] = messages
    .map((msg, index) => ({ msg, index }))
    .filter(({ msg }) => typeof msg.score === 'number' && Number.isFinite(msg.score))
    .map(({ msg, index }) => ({
      turn: index + 1,
      score: clampScore(msg.score as number),
      label: msg.role === 'assistant' ? 'Agent' : 'Lead',
    }));

  if (points.length === 0) return null;

  const width = 640;
  const height = 180;
  const padding = { top: 18, right: 18, bottom: 34, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const xFor = (index: number) => padding.left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const yFor = (score: number) => padding.top + chartHeight - (score / 100) * chartHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.score)}`).join(' ');
  const latest = points[points.length - 1];

  return (
    <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Score Movement</p>
          <p className="mt-0.5 text-xs text-slate-400">Conversation score changes across scored turns</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-slate-900">{latest.score}</div>
          <div className="text-xs font-medium text-slate-400">latest score</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[520px] w-full">
          {[0, 25, 50, 75, 100].map(score => (
            <g key={score}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={yFor(score)}
                y2={yFor(score)}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text x={padding.left - 10} y={yFor(score) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                {score}
              </text>
            </g>
          ))}

          <path d={path} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((point, index) => (
            <g key={`${point.turn}-${index}`}>
              <circle cx={xFor(index)} cy={yFor(point.score)} r="4.5" fill="#ffffff" stroke="#4f46e5" strokeWidth="2.5" />
              <text x={xFor(index)} y={height - 12} textAnchor="middle" className="fill-slate-400 text-[10px]">
                T{point.turn}
              </text>
              <title>{`${point.label} turn ${point.turn}: ${point.score}`}</title>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {points.map(point => (
          <span key={point.turn} className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-500 border border-slate-100">
            T{point.turn}: {point.score}
          </span>
        ))}
      </div>
    </div>
  );
}
