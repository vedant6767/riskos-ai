'use client';
// ── Risk Heatmap ─────────────────────────────────────────────────────────────
// 7-day × 24-hour grid showing when HIGH/CRITICAL transactions cluster.
// Unique to RiskOS AI — answers "when is our risk highest?" visually.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react';

const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapProps {
  // data: array of {day_of_week: 0-6, hour_of_day: 0-23, count: number, level: string}
  data: { day_of_week: number; hour_of_day: number; count: number; level?: string }[];
  loading?: boolean;
}

function cellColor(count: number, max: number): string {
  if (max === 0 || count === 0) return 'bg-slate-900';
  const pct = count / max;
  if (pct < 0.2)  return 'bg-slate-800';
  if (pct < 0.4)  return 'bg-amber-900/40';
  if (pct < 0.6)  return 'bg-amber-600/50';
  if (pct < 0.8)  return 'bg-orange-600/60';
  return 'bg-red-600/70';
}

function cellTitle(day: number, hour: number, count: number): string {
  return `${DAYS[day]} ${hour}:00 — ${count} high-risk transaction${count !== 1 ? 's' : ''}`;
}

export function RiskHeatmap({ data, loading }: HeatmapProps) {
  // Build a 7×24 matrix
  const matrix = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const d of data) {
      if (d.day_of_week >= 0 && d.day_of_week < 7 && d.hour_of_day >= 0 && d.hour_of_day < 24) {
        m[d.day_of_week][d.hour_of_day] += d.count;
      }
    }
    return m;
  }, [data]);

  const max = useMemo(() => Math.max(...matrix.flat(), 1), [matrix]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-3 bg-slate-800 rounded w-24 mb-3" />
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `40px repeat(24, 1fr)` }}>
          {Array.from({ length: 7 * 25 }).map((_, i) => (
            <div key={i} className="h-5 bg-slate-800 rounded-sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Risk Heatmap — High/Critical by Day × Hour
      </p>

      {/* Hour labels */}
      <div
        className="grid mb-0.5"
        style={{ gridTemplateColumns: `40px repeat(24, 1fr)` }}
      >
        <div /> {/* empty corner */}
        {HOURS.map(h => (
          <div key={h} className="text-center text-slate-600 leading-none" style={{ fontSize: 8 }}>
            {h % 6 === 0 ? `${h}h` : ''}
          </div>
        ))}
      </div>

      {/* Rows */}
      {DAYS.map((day, di) => (
        <div
          key={day}
          className="grid mb-0.5"
          style={{ gridTemplateColumns: `40px repeat(24, 1fr)` }}
        >
          <div className="text-xs text-slate-500 flex items-center" style={{ fontSize: 9 }}>
            {day}
          </div>
          {HOURS.map(h => {
            const count = matrix[di][h];
            return (
              <div
                key={h}
                title={cellTitle(di, h, count)}
                className={`h-5 rounded-sm mx-px ${cellColor(count, max)} transition-colors duration-200 cursor-default`}
              />
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-xs text-slate-600">None</span>
        {['bg-slate-800','bg-amber-900/40','bg-amber-600/50','bg-orange-600/60','bg-red-600/70'].map((cls, i) => (
          <div key={i} className={`w-5 h-3 rounded-sm ${cls}`} />
        ))}
        <span className="text-xs text-slate-600">High</span>
        <span className="text-xs text-slate-500 ml-2">· Hover for count</span>
      </div>
    </div>
  );
}
