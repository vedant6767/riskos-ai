'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { EvaluationMetrics } from '@/types';

export const dynamic = 'force-dynamic';

// ── types ──────────────────────────────────────────────────────────────────────
interface EvalRun {
  id: string; model_version: string; threshold: number; created_at: string;
  true_positives: number; false_positives: number;
  true_negatives: number; false_negatives: number;
  precision_score: number; recall_score: number; f1_score: number;
  false_positive_rate: number; false_negative_rate: number;
  false_positive_cost: number; false_negative_cost: number;
  fraud_caught_value: number;
}
interface Dataset {
  name: string; split: string;
  transaction_count: number | null; fraud_count: number | null; legitimate_count: number | null;
}
interface RunResponse {
  runId: string; threshold: number;
  primary: EvaluationMetrics;
  curve: EvaluationMetrics[];
  sampleSize: number; testSetSize: number;
}

// ── helpers ────────────────────────────────────────────────────────────────────
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function fmt(n: number, d = 3) { return n.toFixed(d); }

// ── metric box ─────────────────────────────────────────────────────────────────
function MetricBox({ label, value, sub, accent, desc }: {
  label: string; value: string; sub?: string; accent?: string; desc?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all duration-200">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold transition-all duration-200 ${accent ?? 'text-slate-100'}`}>{value}</p>
      {sub  && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      {desc && <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{desc}</p>}
    </div>
  );
}

// ── confusion matrix ───────────────────────────────────────────────────────────
function ConfusionMatrix({ tp, fp, tn, fn }: { tp: number; fp: number; tn: number; fn: number }) {
  const total = tp + fp + tn + fn;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Confusion Matrix</p>
      <div className="grid grid-cols-2 gap-1.5 max-w-xs">
        {[
          { label: 'True Positives',  value: tp, bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', desc: 'Fraud correctly flagged' },
          { label: 'False Positives', value: fp, bg: 'bg-red-500/10 border-red-500/20',         text: 'text-red-400',     desc: 'Legitimate blocked' },
          { label: 'False Negatives', value: fn, bg: 'bg-orange-500/10 border-orange-500/20',   text: 'text-orange-400',  desc: 'Fraud missed' },
          { label: 'True Negatives',  value: tn, bg: 'bg-slate-800 border-slate-700',           text: 'text-slate-300',   desc: 'Legitimate allowed' },
        ].map(cell => (
          <div key={cell.label} className={`rounded-lg border p-3 ${cell.bg} transition-all duration-200`}>
            <p className={`text-xl font-bold ${cell.text}`}>{cell.value.toLocaleString('en-IN')}</p>
            <p className="text-xs text-slate-500">{cell.label}</p>
            <p className="text-xs text-slate-600 mt-0.5">{cell.desc}</p>
            <p className="text-xs text-slate-600">{total > 0 ? pct(cell.value / total) : '—'}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600 mt-2">Total test records: {total.toLocaleString('en-IN')}</p>
    </div>
  );
}

// ── threshold slider ───────────────────────────────────────────────────────────
function ThresholdSlider({
  value, onChange, disabled,
}: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const pctPos = ((value - 1) / 98) * 100;
  const trackColor =
    value <= 30 ? '#10b981' :
    value <= 60 ? '#f59e0b' :
    value <= 80 ? '#f97316' : '#ef4444';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor="threshold-slider" className="text-xs text-slate-400 font-medium">
          Risk threshold
        </label>
        <div className="flex items-center gap-2">
          <span
            className="text-lg font-bold tabular-nums transition-all duration-150"
            style={{ color: trackColor }}
          >
            {value}
          </span>
          <span className="text-xs text-slate-500">/ 100</span>
          {/* Numeric input for precise entry */}
          <input
            type="number"
            min={1} max={99}
            value={value}
            disabled={disabled}
            onChange={e => onChange(Math.max(1, Math.min(99, parseInt(e.target.value) || value)))}
            className="w-14 h-7 rounded-md border border-slate-700 bg-slate-900 text-slate-200 text-xs px-2 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Range slider */}
      <div className="relative">
        <input
          id="threshold-slider"
          type="range"
          min={1} max={99} step={1}
          value={value}
          disabled={disabled}
          onChange={e => onChange(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-800 disabled:cursor-not-allowed"
          style={{
            // Dynamic gradient fill up to thumb position
            background: `linear-gradient(to right, ${trackColor} 0%, ${trackColor} ${pctPos}%, #1e293b ${pctPos}%, #1e293b 100%)`,
          }}
        />
      </div>

      {/* Zone labels */}
      <div className="flex justify-between text-xs text-slate-600">
        <span>LOW ←</span>
        <span className="text-amber-600">MEDIUM</span>
        <span className="text-orange-600">HIGH</span>
        <span className="text-red-600">→ CRITICAL</span>
      </div>
    </div>
  );
}

// ── custom chart tooltip ───────────────────────────────────────────────────────
function CurveTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">Threshold: {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{(p.value * 100).toFixed(1)}%</span>
        </p>
      ))}
    </div>
  );
}

// ── skeleton ───────────────────────────────────────────────────────────────────
function EvalSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 h-24" />
        ))}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 h-32" />
      <div className="grid sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-800 h-28" />
        ))}
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────
export default function EvaluationPage() {
  const { user }  = useSession();
  const toast     = useToast();

  const [threshold,   setThreshold]   = useState(60);
  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState<RunResponse | null>(null);
  const [pastRuns,    setPastRuns]    = useState<EvalRun[]>([]);
  const [datasets,    setDatasets]    = useState<Dataset[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const canRun = ['ADMIN', 'RISK_ANALYST'].includes(user?.role ?? '');

  const fetchPastRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/evaluation/runs', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPastRuns(data.runs ?? []);
        setDatasets(data.datasets ?? []);
      }
    } catch { /* silent */ }
    finally { setLoadingRuns(false); }
  }, []);

  useEffect(() => { fetchPastRuns(); }, [fetchPastRuns]);

  async function runEvaluation() {
    setRunning(true);
    setError(null);
    try {
      const res  = await fetch('/api/evaluation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Evaluation failed'); toast('error', 'Evaluation failed', json.error); }
      else { setResult(json); toast('success', 'Evaluation complete', `${json.sampleSize} test records evaluated.`); await fetchPastRuns(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Network error'); }
    finally { setRunning(false); }
  }

  // ── Live metric derivation from curve as slider moves ──────────────────────
  // When a result is loaded, interpolate metrics for the current threshold
  // from the pre-computed curve so the UI updates instantly without a new API call.
  const liveMetrics: EvaluationMetrics | null = useMemo(() => {
    if (!result) return null;
    const { curve, primary } = result;

    // Exact match
    const exact = curve.find(m => m.threshold === threshold);
    if (exact) return exact;

    // Interpolate between two nearest curve points
    const sorted = [...curve].sort((a, b) => a.threshold - b.threshold);
    const below  = [...sorted].reverse().find(m => m.threshold <= threshold);
    const above  = sorted.find(m => m.threshold >= threshold);

    if (!below && !above) return primary;
    if (!below) return above!;
    if (!above) return below;
    if (below.threshold === above.threshold) return below;

    const t = (threshold - below.threshold) / (above.threshold - below.threshold);
    return {
      threshold,
      truePositives:   Math.round(below.truePositives   + t * (above.truePositives   - below.truePositives)),
      falsePositives:  Math.round(below.falsePositives  + t * (above.falsePositives  - below.falsePositives)),
      trueNegatives:   Math.round(below.trueNegatives   + t * (above.trueNegatives   - below.trueNegatives)),
      falseNegatives:  Math.round(below.falseNegatives  + t * (above.falseNegatives  - below.falseNegatives)),
      precision:       below.precision      + t * (above.precision      - below.precision),
      recall:          below.recall         + t * (above.recall         - below.recall),
      f1:              below.f1             + t * (above.f1             - below.f1),
      falsePositiveRate: below.falsePositiveRate + t * (above.falsePositiveRate - below.falsePositiveRate),
      falseNegativeRate: below.falseNegativeRate + t * (above.falseNegativeRate - below.falseNegativeRate),
      avgTxAmount:     below.avgTxAmount,
      falsePositiveCost: below.falsePositiveCost + t * (above.falsePositiveCost - below.falsePositiveCost),
      falseNegativeCost: below.falseNegativeCost + t * (above.falseNegativeCost - below.falseNegativeCost),
      fraudCaughtValue:  below.fraudCaughtValue  + t * (above.fraudCaughtValue  - below.fraudCaughtValue),
      totalTransactions: below.totalTransactions,
      fraudTransactions: below.fraudTransactions,
    };
  }, [result, threshold]);

  const m = liveMetrics;
  const curve = result?.curve ?? [];
  const testDataset = datasets.find(d => d.split === 'test');
  const devDataset  = datasets.find(d => d.split === 'dev');

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header + run controls */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            Held-Out Test Set · Model v1.0
          </p>
          <p className="text-sm text-slate-400 max-w-xl">
            Metrics are calculated live from the database — no hardcoded numbers.
            The test set was never used during development.
          </p>
        </div>
        {canRun && (
          <div className="w-full sm:w-72 space-y-3">
            <ThresholdSlider value={threshold} onChange={setThreshold} disabled={running} />
            <Button variant="primary" size="md" loading={running} onClick={runEvaluation} className="w-full">
              {running ? 'Running evaluation…' : 'Run Evaluation'}
            </Button>
          </div>
        )}
      </div>

      {/* Dataset summary */}
      {(testDataset || devDataset) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {devDataset && (
            <Card>
              <div className="flex items-center justify-between mb-2">
                <CardTitle>Development Set</CardTitle>
                <Badge variant="ghost">dev</Badge>
              </div>
              <div className="flex gap-6 text-sm">
                <div><p className="text-xs text-slate-500">Total</p><p className="font-bold text-slate-200">{devDataset.transaction_count?.toLocaleString('en-IN') ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Fraud</p><p className="font-bold text-red-400">{devDataset.fraud_count?.toLocaleString('en-IN') ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Legit</p><p className="font-bold text-emerald-400">{devDataset.legitimate_count?.toLocaleString('en-IN') ?? '—'}</p></div>
              </div>
              <p className="text-xs text-slate-600 mt-2">Used for model development. Not used for evaluation.</p>
            </Card>
          )}
          {testDataset && (
            <Card>
              <div className="flex items-center justify-between mb-2">
                <CardTitle>Held-Out Test Set</CardTitle>
                <Badge variant="purple">test</Badge>
              </div>
              <div className="flex gap-6 text-sm">
                <div><p className="text-xs text-slate-500">Total</p><p className="font-bold text-slate-200">{testDataset.transaction_count?.toLocaleString('en-IN') ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Fraud</p><p className="font-bold text-red-400">{testDataset.fraud_count?.toLocaleString('en-IN') ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Legit</p><p className="font-bold text-emerald-400">{testDataset.legitimate_count?.toLocaleString('en-IN') ?? '—'}</p></div>
              </div>
              <p className="text-xs text-slate-600 mt-2">Never touched during development. Used only for evaluation.</p>
            </Card>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Live results — update as slider moves */}
      {m ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-bold text-slate-100">
              Results at threshold <span className="text-blue-400">{threshold}</span>
            </h2>
            <Badge variant="blue">{result!.sampleSize.toLocaleString('en-IN')} test records</Badge>
            {threshold !== result?.threshold && (
              <Badge variant="ghost">interpolated — run to persist</Badge>
            )}
          </div>

          {/* Core metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricBox label="Precision" value={pct(m.precision)}
              accent={m.precision > 0.7 ? 'text-emerald-400' : m.precision > 0.5 ? 'text-amber-400' : 'text-red-400'}
              desc="Of all flagged, how many were actually fraud" />
            <MetricBox label="Recall" value={pct(m.recall)}
              accent={m.recall > 0.7 ? 'text-emerald-400' : m.recall > 0.5 ? 'text-amber-400' : 'text-red-400'}
              desc="Of all fraud, how many were caught" />
            <MetricBox label="F1 Score" value={fmt(m.f1, 3)}
              accent={m.f1 > 0.7 ? 'text-emerald-400' : m.f1 > 0.5 ? 'text-amber-400' : 'text-red-400'}
              desc="Harmonic mean of precision and recall" />
            <MetricBox label="FP Rate" value={pct(m.falsePositiveRate)}
              accent={m.falsePositiveRate < 0.1 ? 'text-emerald-400' : m.falsePositiveRate < 0.2 ? 'text-amber-400' : 'text-red-400'}
              desc="Legit transactions incorrectly flagged" />
            <MetricBox label="FN Rate" value={pct(m.falseNegativeRate)}
              accent={m.falseNegativeRate < 0.2 ? 'text-emerald-400' : 'text-red-400'}
              desc="Fraud transactions that were missed" />
            <MetricBox label="Detection" value={pct(m.recall)}
              sub={`${m.truePositives} of ${m.fraudTransactions} fraud`}
              accent="text-blue-400" />
          </div>

          {/* Financial impact */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Impact at Threshold {threshold}</CardTitle>
              <p className="text-xs text-slate-500">All figures in INR · calculated from actual transaction amounts</p>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Fraud Caught',        value: m.fraudCaughtValue,   color: 'emerald', desc: 'Sum of correctly blocked fraud' },
                { label: 'False Positive Cost', value: m.falsePositiveCost,  color: 'red',     desc: `${m.falsePositives} legit transactions blocked` },
                { label: 'Missed Fraud',        value: m.falseNegativeCost,  color: 'orange',  desc: `${m.falseNegatives} fraud transactions slipped through` },
              ].map(item => (
                <div key={item.label}
                  className={`rounded-xl border border-${item.color}-500/20 bg-${item.color}-500/5 p-4 transition-all duration-200`}>
                  <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                  <p className={`text-2xl font-bold text-${item.color}-400 transition-all duration-200`}>
                    {formatCurrency(item.value)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
            {/* Comparative bar */}
            <div className="mt-4 rounded-lg bg-slate-800/40 p-3 space-y-2">
              {[
                { label: 'Fraud caught',    val: m.fraudCaughtValue,  color: 'bg-emerald-500' },
                { label: 'FP cost',         val: m.falsePositiveCost, color: 'bg-red-500' },
                { label: 'Missed fraud',    val: m.falseNegativeCost, color: 'bg-orange-500' },
              ].map(row => {
                const maxVal = Math.max(m.fraudCaughtValue, m.falsePositiveCost, m.falseNegativeCost, 1);
                const w = Math.max(2, (row.val / maxVal) * 100);
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <p className="text-xs text-slate-400 w-24 shrink-0">{row.label}</p>
                    <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.color} rounded-full transition-all duration-300`}
                        style={{ width: `${w}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 w-20 text-right shrink-0">{formatCurrency(row.val)}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-600 mt-3">
              <strong className="text-slate-500">Assumptions:</strong> FP cost = blocked legitimate transaction value (opportunity cost).
              Missed fraud = fraud transaction amount passed undetected. Upper-bound estimates.
            </p>
          </Card>

          {/* Confusion matrix */}
          <Card>
            <ConfusionMatrix
              tp={m.truePositives} fp={m.falsePositives}
              tn={m.trueNegatives} fn={m.falseNegatives}
            />
          </Card>

          {/* PR curve with live reference line */}
          {curve.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Precision / Recall / F1 vs. Threshold</CardTitle>
                <p className="text-xs text-slate-500">Drag the slider above — the line updates live</p>
              </CardHeader>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={curve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="threshold" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 1]} />
                  <Tooltip content={<CurveTooltip />} />
                  <ReferenceLine
                    x={threshold}
                    stroke="#6366f1"
                    strokeDasharray="3 3"
                    label={{ value: `▲ ${threshold}`, fill: '#818cf8', fontSize: 10 }}
                  />
                  <Line type="monotone" dataKey="precision" name="Precision" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="recall"    name="Recall"    stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="f1"        name="F1"        stroke="#a855f7" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="falsePositiveRate" name="FP Rate" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-600 mt-2 text-center">
                Higher threshold → fewer flags → higher precision, lower recall.
              </p>
            </Card>
          )}
        </div>
      ) : loadingRuns ? (
        <EvalSkeleton />
      ) : (
        <EmptyState
          title="No evaluation run yet"
          description={canRun ? "Set a threshold with the slider and click 'Run Evaluation'." : "Contact an ADMIN or RISK_ANALYST to run an evaluation."}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
            </svg>
          }
        />
      )}

      {/* Past runs */}
      {pastRuns.length > 0 && (
        <Card padding="none">
          <div className="px-5 py-4 border-b border-slate-800">
            <CardTitle>Past Evaluation Runs</CardTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label="Past evaluation runs">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Date', 'Model', 'Threshold', 'Precision', 'Recall', 'F1', 'FP Rate', 'FP Cost', 'Fraud Caught'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pastRuns.map(run => (
                  <tr
                    key={run.id}
                    className={`hover:bg-slate-800/20 cursor-pointer transition-colors ${run.threshold === threshold && result?.runId === run.id ? 'bg-blue-500/5' : ''}`}
                    onClick={() => setThreshold(run.threshold)}
                    title="Click to set slider to this threshold"
                  >
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(run.created_at)}</td>
                    <td className="px-4 py-3 text-slate-300">{run.model_version}</td>
                    <td className="px-4 py-3 font-bold text-slate-200">{run.threshold}</td>
                    <td className="px-4 py-3 text-emerald-400">{pct(run.precision_score)}</td>
                    <td className="px-4 py-3 text-blue-400">{pct(run.recall_score)}</td>
                    <td className="px-4 py-3 text-purple-400">{run.f1_score?.toFixed(3)}</td>
                    <td className="px-4 py-3 text-red-400">{pct(run.false_positive_rate)}</td>
                    <td className="px-4 py-3 text-red-300">{formatCurrency(run.false_positive_cost)}</td>
                    <td className="px-4 py-3 text-emerald-300">{formatCurrency(run.fraud_caught_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
