'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
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

function MetricBox({ label, value, sub, accent, desc }: {
  label: string; value: string; sub?: string; accent?: string; desc?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      {desc && <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{desc}</p>}
    </div>
  );
}

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
          <div key={cell.label} className={`rounded-lg border p-3 ${cell.bg}`}>
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

// ── custom tooltip ─────────────────────────────────────────────────────────────
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

// ── page ───────────────────────────────────────────────────────────────────────
export default function EvaluationPage() {
  const { user } = useSession();
  const toast = useToast();

  const [threshold, setThreshold] = useState(60);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [pastRuns, setPastRuns] = useState<EvalRun[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch('/api/evaluation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Evaluation failed');
        toast('error', 'Evaluation failed', json.error);
      } else {
        setResult(json);
        toast('success', 'Evaluation complete', `${json.sampleSize} test records evaluated.`);
        await fetchPastRuns();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setRunning(false);
    }
  }

  const m = result?.primary;
  const curve = result?.curve ?? [];

  const testDataset = datasets.find(d => d.split === 'test');
  const devDataset  = datasets.find(d => d.split === 'dev');

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            Held-Out Test Set · Model v1.0
          </p>
          <p className="text-sm text-slate-400 max-w-xl">
            Metrics are calculated live from database records — no hardcoded numbers.
            The test set was never used during model development.
          </p>
        </div>
        {canRun && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <label htmlFor="threshold-input" className="text-xs text-slate-400 whitespace-nowrap">
                Threshold:
              </label>
              <input
                id="threshold-input"
                type="number"
                min={1} max={99}
                value={threshold}
                onChange={e => setThreshold(Math.max(1, Math.min(99, parseInt(e.target.value) || 60)))}
                className="w-16 h-9 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-sm px-3 focus:border-blue-500 outline-none"
              />
            </div>
            <Button variant="primary" size="md" loading={running} onClick={runEvaluation}>
              {running ? 'Running…' : 'Run Evaluation'}
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
                <div>
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="font-bold text-slate-200">{devDataset.transaction_count?.toLocaleString('en-IN') ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fraud</p>
                  <p className="font-bold text-red-400">{devDataset.fraud_count?.toLocaleString('en-IN') ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Legit</p>
                  <p className="font-bold text-emerald-400">{devDataset.legitimate_count?.toLocaleString('en-IN') ?? '—'}</p>
                </div>
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
                <div>
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="font-bold text-slate-200">{testDataset.transaction_count?.toLocaleString('en-IN') ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fraud</p>
                  <p className="font-bold text-red-400">{testDataset.fraud_count?.toLocaleString('en-IN') ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Legit</p>
                  <p className="font-bold text-emerald-400">{testDataset.legitimate_count?.toLocaleString('en-IN') ?? '—'}</p>
                </div>
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

      {/* Results */}
      {m ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-100">
              Results — Threshold {result!.threshold}
            </h2>
            <Badge variant="blue">
              {result!.sampleSize.toLocaleString('en-IN')} test records
            </Badge>
          </div>

          {/* Core metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricBox
              label="Precision" value={pct(m.precision)}
              accent={m.precision > 0.7 ? 'text-emerald-400' : m.precision > 0.5 ? 'text-amber-400' : 'text-red-400'}
              desc="Of all flagged, how many were actually fraud"
            />
            <MetricBox
              label="Recall" value={pct(m.recall)}
              accent={m.recall > 0.7 ? 'text-emerald-400' : m.recall > 0.5 ? 'text-amber-400' : 'text-red-400'}
              desc="Of all fraud, how many were caught"
            />
            <MetricBox
              label="F1 Score" value={fmt(m.f1, 3)}
              accent={m.f1 > 0.7 ? 'text-emerald-400' : m.f1 > 0.5 ? 'text-amber-400' : 'text-red-400'}
              desc="Harmonic mean of precision and recall"
            />
            <MetricBox
              label="False Positive Rate" value={pct(m.falsePositiveRate)}
              accent={m.falsePositiveRate < 0.1 ? 'text-emerald-400' : m.falsePositiveRate < 0.2 ? 'text-amber-400' : 'text-red-400'}
              desc="Legit transactions incorrectly flagged"
            />
            <MetricBox
              label="False Negative Rate" value={pct(m.falseNegativeRate)}
              accent={m.falseNegativeRate < 0.2 ? 'text-emerald-400' : 'text-red-400'}
              desc="Fraud transactions that were missed"
            />
            <MetricBox
              label="Detection Rate" value={pct(m.recall)}
              sub={`${m.truePositives} of ${m.fraudTransactions} fraud`}
              accent="text-blue-400"
            />
          </div>

          {/* Financial impact */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Impact</CardTitle>
              <p className="text-xs text-slate-500">All figures in INR, calculated from actual transaction amounts</p>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs text-slate-500 mb-1">Fraud Caught (value)</p>
                <p className="text-2xl font-bold text-emerald-400">{formatCurrency(m.fraudCaughtValue)}</p>
                <p className="text-xs text-slate-600 mt-1">Sum of correctly blocked fraud transactions</p>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-xs text-slate-500 mb-1">False Positive Cost</p>
                <p className="text-2xl font-bold text-red-400">{formatCurrency(m.falsePositiveCost)}</p>
                <p className="text-xs text-slate-600 mt-1">
                  Value of legitimate transactions incorrectly blocked ({m.falsePositives} transactions)
                </p>
              </div>
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                <p className="text-xs text-slate-500 mb-1">Missed Fraud (false negatives)</p>
                <p className="text-2xl font-bold text-orange-400">{formatCurrency(m.falseNegativeCost)}</p>
                <p className="text-xs text-slate-600 mt-1">
                  Value of fraud that slipped through ({m.falseNegatives} transactions)
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 text-xs text-slate-400">
              <strong className="text-slate-300">Assumptions:</strong> False positive cost = transaction amount blocked (opportunity cost to merchant).
              False negative cost = transaction amount that passed through as undetected fraud.
              These are upper-bound estimates — actual costs may differ.
            </div>
          </Card>

          {/* Confusion matrix */}
          <Card>
            <ConfusionMatrix tp={m.truePositives} fp={m.falsePositives} tn={m.trueNegatives} fn={m.falseNegatives} />
          </Card>

          {/* Precision-recall curve */}
          {curve.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Precision / Recall / F1 vs. Threshold</CardTitle>
                <p className="text-xs text-slate-500">Calculated at 8 threshold points on the held-out test set</p>
              </CardHeader>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={curve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="threshold"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    label={{ value: 'Threshold', position: 'insideBottom', fill: '#475569', fontSize: 10, dy: 8 }}
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 1]} />
                  <Tooltip content={<CurveTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine x={threshold} stroke="#6366f1" strokeDasharray="3 3" label={{ value: '↑ current', fill: '#818cf8', fontSize: 10 }} />
                  <Line type="monotone" dataKey="precision" name="Precision" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="recall"    name="Recall"    stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="f1"        name="F1"        stroke="#a855f7" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="falsePositiveRate" name="FP Rate" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-600 mt-2 text-center">
                Higher threshold → fewer flags → higher precision, lower recall.
                Lower threshold → more flags → higher recall, more false positives.
              </p>
            </Card>
          )}
        </div>
      ) : (
        !loadingRuns && (
          <EmptyState
            title="No evaluation run yet"
            description={canRun
              ? "Set a threshold and click 'Run Evaluation' to calculate metrics on the held-out test set."
              : "Contact an ADMIN or RISK_ANALYST to run an evaluation."}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
              </svg>
            }
          />
        )
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
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pastRuns.map(run => (
                  <tr key={run.id} className="hover:bg-slate-800/20">
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
