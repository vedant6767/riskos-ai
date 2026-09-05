'use client';
// ── Score Boundary Proximity ─────────────────────────────────────────────────
// Shows how far the score is from the next risk level boundary.
// "Score is 7 points from CRITICAL" is much more useful than just "Score: 73".
// This contextualises the score in a way that drives human review priority.
// ─────────────────────────────────────────────────────────────────────────────

interface BoundaryInfo {
  nextLevel: string | null;
  prevLevel: string | null;
  ptsToNext: number | null;
  ptsFromPrev: number | null;
  danger: boolean;
}

function getBoundaryInfo(score: number, policy?: {
  low_max: number; medium_max: number; high_max: number;
}): BoundaryInfo {
  const LOW_MAX    = policy?.low_max    ?? 30;
  const MEDIUM_MAX = policy?.medium_max ?? 60;
  const HIGH_MAX   = policy?.high_max   ?? 80;

  if (score <= LOW_MAX) {
    return {
      nextLevel: 'MEDIUM', prevLevel: null,
      ptsToNext: LOW_MAX - score + 1, ptsFromPrev: null,
      danger: LOW_MAX - score <= 5,
    };
  }
  if (score <= MEDIUM_MAX) {
    return {
      nextLevel: 'HIGH', prevLevel: 'LOW',
      ptsToNext: MEDIUM_MAX - score + 1, ptsFromPrev: score - LOW_MAX,
      danger: MEDIUM_MAX - score <= 8,
    };
  }
  if (score <= HIGH_MAX) {
    return {
      nextLevel: 'CRITICAL', prevLevel: 'MEDIUM',
      ptsToNext: HIGH_MAX - score + 1, ptsFromPrev: score - MEDIUM_MAX,
      danger: HIGH_MAX - score <= 6,
    };
  }
  return {
    nextLevel: null, prevLevel: 'HIGH',
    ptsToNext: null, ptsFromPrev: score - HIGH_MAX,
    danger: false,
  };
}

const LEVEL_COLORS: Record<string, string> = {
  LOW: 'text-emerald-400', MEDIUM: 'text-amber-400',
  HIGH: 'text-orange-400', CRITICAL: 'text-red-400',
};

export function ScoreBoundary({ score, policy }: {
  score: number;
  policy?: { low_max: number; medium_max: number; high_max: number };
}) {
  const info = getBoundaryInfo(score, policy);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Level Proximity
      </p>

      {info.nextLevel && info.ptsToNext !== null && (
        <div className={`flex items-center gap-1.5 text-xs ${info.danger ? 'text-red-400' : 'text-slate-400'}`}>
          {info.danger && <span className="animate-pulse">⚠</span>}
          <span>
            <span className="font-bold text-slate-200">{info.ptsToNext} pt{info.ptsToNext !== 1 ? 's' : ''}</span>
            {' '}from{' '}
            <span className={`font-bold ${LEVEL_COLORS[info.nextLevel]}`}>{info.nextLevel}</span>
          </span>
        </div>
      )}

      {info.nextLevel === null && (
        <p className="text-xs text-red-400 font-medium">
          ⚑ Maximum risk level reached
        </p>
      )}

      {/* Mini progress bar within current level band */}
      {info.ptsFromPrev !== null && info.ptsToNext !== null && (
        <div className="space-y-0.5">
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                info.danger ? 'bg-red-500' : 'bg-slate-500'
              }`}
              style={{
                width: `${(info.ptsFromPrev / (info.ptsFromPrev + info.ptsToNext - 1)) * 100}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>{info.prevLevel}</span>
            <span>{info.nextLevel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
