'use client';
import { useEffect, useState, useCallback, use } from 'react';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge, RiskBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Textarea } from '@/components/ui/Input';
import { formatCurrency, formatDate, maskId } from '@/lib/utils';
import { calculateCounterfactual } from '@/lib/risk-engine';
import type { CounterfactualResult, RiskLevel } from '@/types';

export const dynamic = 'force-dynamic';

// ── types local to this page ───────────────────────────────────────────────────
interface Signal { signal_type: string; contribution: number; description: string | null; signal_value: number | null }
interface AuditEntry {
  id: string; event_type: string; action: string; actor_type: string;
  details: Record<string, unknown>; policy_result: string | null;
  outcome: string | null; created_at: string;
  actor: { full_name: string | null; email: string } | null;
}
interface AIDecision {
  id: string; risk_assessment: string; confidence_score: number;
  primary_reason: string; supporting_evidence: string[];
  counter_evidence: string[]; recommended_action: string;
  reasoning_summary: string; uncertainty_notes: string | null;
  requires_human_review: boolean; engine_verdict: string;
  ai_verdict: string; verdicts_agree: boolean | null;
  model_used: string; created_at: string;
}
interface CaseData {
  id: string; case_number: string; status: string; priority: string;
  created_at: string; updated_at: string; resolved_at: string | null; resolution: string | null;
  transaction: {
    id: string; external_tx_id: string; amount: number; currency: string;
    payment_method: string; payment_status: string; hour_of_day: number | null;
    day_of_week: number | null; is_international: boolean; ip_country: string | null;
    dataset_split: string | null; created_at: string;
    customer: { external_id: string; account_age_days: number | null; avg_transaction_amount: number | null; total_transactions: number; risk_tier: string } | null;
    device: { device_type: string | null; os: string | null; is_known_fraudulent: boolean; device_fingerprint: string } | null;
  } | null;
  risk_score: { id: string; score: number; level: string; model_version: string; calculated_at: string } | null;
  investigation: {
    id: string; status: string; started_at: string; completed_at: string | null;
    ai_decision: AIDecision | null;
  } | null;
  review_queue: {
    id: string; status: string; policy_action: string | null;
    analyst_decision: string | null; analyst_notes: string | null;
    decided_at: string | null; created_at: string;
    decider: { full_name: string | null; email: string } | null;
  } | null;
}

// ── score gauge ────────────────────────────────────────────────────────────────
function ScoreGauge({ score, level }: { score: number; level: string }) {
  const pct = score;
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = level === 'CRITICAL' ? '#ef4444' : level === 'HIGH' ? '#f97316' : level === 'MEDIUM' ? '#f59e0b' : '#10b981';
  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" viewBox="0 0 100 100" aria-label={`Risk score ${score} out of 100`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="50" y="46" textAnchor="middle" fill={color} fontSize="18" fontWeight="700">{score}</text>
        <text x="50" y="60" textAnchor="middle" fill="#64748b" fontSize="9">/100</text>
      </svg>
      <span className={`text-xs font-bold mt-1 ${
        level === 'CRITICAL' ? 'text-red-400' : level === 'HIGH' ? 'text-orange-400' :
        level === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
      }`}>{level}</span>
    </div>
  );
}

// ── signal bar ─────────────────────────────────────────────────────────────────
function SignalBar({ signal }: { signal: Signal }) {
  const maxPts = 25;
  const pct = Math.min(100, (signal.contribution / maxPts) * 100);
  const color = signal.contribution >= 20 ? 'bg-red-500' : signal.contribution >= 10 ? 'bg-orange-500' : signal.contribution >= 5 ? 'bg-amber-500' : 'bg-emerald-500';
  const label = signal.signal_type.replace(/_/g, ' ');
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 capitalize">{label}</span>
        <span className={`font-bold ${signal.contribution > 0 ? 'text-slate-200' : 'text-slate-600'}`}>
          {signal.contribution > 0 ? `+${signal.contribution}` : '0'} pts
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} aria-hidden="true" />
      </div>
      <p className="text-xs text-slate-500">{signal.description ?? '—'}</p>
    </div>
  );
}

// ── verdict comparison ─────────────────────────────────────────────────────────
function DualVerdict({ aiDecision }: { aiDecision: AIDecision }) {
  const agree = aiDecision.verdicts_agree;
  return (
    <div className="space-y-3">
      {!agree && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-300">Verdict Disagreement</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              The deterministic engine and the AI investigator reached different risk levels.
              This case requires careful human review.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Rule Engine
          </p>
          <RiskBadge level={aiDecision.engine_verdict} />
          <p className="text-xs text-slate-500 mt-2">Deterministic calculation from 5 signals. No LLM.</p>
        </div>
        <div className={`rounded-xl border p-4 ${
          agree ? 'border-slate-700 bg-slate-800/40' : 'border-amber-500/30 bg-amber-500/5'
        }`}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            AI Investigator
          </p>
          <RiskBadge level={aiDecision.ai_verdict} />
          <p className="text-xs text-slate-500 mt-2">
            Gemini analysis · confidence {aiDecision.confidence_score}%
          </p>
        </div>
      </div>
      {agree && (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Engine and AI agree on risk level.
        </p>
      )}
    </div>
  );
}

// ── confidence banner ──────────────────────────────────────────────────────────
function ConfidenceBanner({ confidence, threshold = 70 }: { confidence: number; threshold?: number }) {
  if (confidence >= threshold) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3" role="alert">
      <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <div>
        <p className="text-sm font-bold text-red-300">
          Low AI Confidence ({confidence}%) — Human Review Recommended
        </p>
        <p className="text-xs text-red-400/80 mt-0.5">
          The AI investigator&apos;s confidence is below the {threshold}% threshold.
          Do not rely on this assessment alone. A human analyst must review this case.
        </p>
      </div>
    </div>
  );
}

// ── counterfactual panel ───────────────────────────────────────────────────────
function CounterfactualPanel({ signals, originalScore, originalLevel }: {
  signals: Signal[]; originalScore: number; originalLevel: string;
}) {
  let result: CounterfactualResult;
  try {
    const engineSignals = signals.map(s => ({
      type: s.signal_type, value: s.signal_value ?? 0,
      contribution: s.contribution, description: s.description ?? '',
    }));
    result = calculateCounterfactual(engineSignals, originalScore, originalLevel as RiskLevel);
  } catch {
    return (
      <p className="text-xs text-slate-500 py-2">
        Counterfactual analysis unavailable for this case.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-400">
        <strong>Simulation only.</strong> {result.disclaimer}
      </div>
      <p className="text-xs text-slate-500">
        Starting score: <span className="text-slate-200 font-bold">{result.originalScore}</span> ({result.originalLevel})
      </p>
      {result.steps.length === 0 ? (
        <p className="text-xs text-slate-500">No active signals — score is already minimal.</p>
      ) : (
        <div className="space-y-2">
          {result.steps.map((step, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-300 capitalize">
                  Remove: {step.signalType.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-slate-500 truncate">{step.description}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-emerald-400">
                  {originalScore} → {step.scoreWithout}
                </p>
                <RiskBadge level={step.levelWithout} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── trust receipt ──────────────────────────────────────────────────────────────
function TrustReceipt({ caseData, signals, aiDecision }: {
  caseData: CaseData; signals: Signal[]; aiDecision: AIDecision | null;
}) {
  const [copied, setCopied] = useState(false);
  const tx = caseData.transaction;
  const rs = caseData.risk_score;
  const rq = caseData.review_queue;
  const topSignals = [...signals].sort((a, b) => b.contribution - a.contribution).slice(0, 3);

  const receiptText = [
    `RISKOS AI — TRUST RECEIPT`,
    `Case: ${caseData.case_number}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `TRANSACTION`,
    `ID: ${tx?.external_tx_id ?? '—'}`,
    `Amount: ${tx ? formatCurrency(tx.amount) : '—'}`,
    `Method: ${tx?.payment_method ?? '—'}`,
    ``,
    `RISK SCORE`,
    `Score: ${rs?.score ?? '—'} / 100  (${rs?.level ?? '—'})`,
    `Model: ${rs?.model_version ?? '—'}`,
    ``,
    `TOP EVIDENCE`,
    ...topSignals.map((s, i) => `${i + 1}. ${s.signal_type.replace(/_/g, ' ')}: +${s.contribution} pts — ${s.description ?? ''}`),
    ``,
    `POLICY ACTION: ${rq?.policy_action?.toUpperCase() ?? '—'}`,
    `AI RECOMMENDATION: ${aiDecision?.recommended_action?.toUpperCase() ?? '—'}`,
    ``,
    `HUMAN DECISION`,
    `Decision: ${rq?.analyst_decision?.replace(/_/g, ' ').toUpperCase() ?? 'PENDING'}`,
    `Reviewer: ${rq?.decider?.full_name ?? rq?.decider?.email ?? '—'}`,
    `Decided: ${rq?.decided_at ? formatDate(rq.decided_at) : '—'}`,
    ``,
    `Case status: ${caseData.status.toUpperCase()}`,
    `Case opened: ${formatDate(caseData.created_at)}`,
    ``,
    `NOTE: This receipt is a summary for compliance and audit purposes.`,
    `It does not constitute a financial or legal determination.`,
  ].join('\n');

  function copyReceipt() {
    navigator.clipboard.writeText(receiptText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
        {receiptText}
      </div>
      <Button variant="outline" size="sm" onClick={copyReceipt} className="w-full">
        {copied ? '✓ Copied to clipboard' : 'Copy Trust Receipt'}
      </Button>
    </div>
  );
}

// ── audit timeline ─────────────────────────────────────────────────────────────
function AuditTimeline({ logs }: { logs: AuditEntry[] }) {
  if (logs.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">No audit events recorded yet.</p>;
  }
  return (
    <ol className="relative border-l border-slate-800 space-y-4 pl-4" aria-label="Audit timeline">
      {logs.map((log) => {
        const actorLabel = log.actor?.full_name ?? log.actor?.email ?? log.actor_type;
        const isAI = log.actor_type === 'ai';
        const isUser = log.actor_type === 'user';
        return (
          <li key={log.id} className="relative">
            <span
              className={`absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full border-2 border-slate-950 ${
                isAI ? 'bg-purple-500' : isUser ? 'bg-blue-500' : 'bg-slate-600'
              }`}
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-300">{log.action}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">{formatDate(log.created_at)}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  isAI ? 'bg-purple-500/10 text-purple-400' :
                  isUser ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {actorLabel}
                </span>
                {log.policy_result && (
                  <Badge variant="default">{log.policy_result}</Badge>
                )}
                {log.outcome && (
                  <Badge variant={log.outcome === 'success' || log.outcome === 'completed' ? 'low' : 'default'}>
                    {log.outcome}
                  </Badge>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <h2 className={`text-sm font-bold mb-4 ${accent ?? 'text-slate-200'}`}>{title}</h2>
      {children}
    </Card>
  );
}

// ── collapsible section ────────────────────────────────────────────────────────
function Collapsible({ title, children, defaultOpen = false, accent }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card padding="none">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className={`text-sm font-bold ${accent ?? 'text-slate-200'}`}>{title}</span>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </Card>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
function InvestigationContent({ id }: { id: string }) {
  const { user } = useSession();
  const toast = useToast();

  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'receipt' | 'audit'>('overview');

  const canInvestigate = ['ADMIN', 'RISK_ANALYST'].includes(user?.role ?? '');
  const canReview      = ['ADMIN', 'RISK_ANALYST'].includes(user?.role ?? '');

  const fetchCase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${id}`, { cache: 'no-store' });
      if (res.status === 404) { setError('Case not found'); return; }
      if (!res.ok) throw new Error('Failed to load case');
      const data = await res.json();
      setCaseData(data.case);
      setSignals(data.signals ?? []);
      setAuditLogs(data.auditLogs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  async function handleInvestigate() {
    setInvestigating(true);
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast('error', 'Investigation failed', json.error ?? 'Unknown error');
      } else if (json.aiFailed) {
        toast('warning', 'AI unavailable', `Fell back to engine verdict. ${json.aiError ?? ''}`);
        await fetchCase();
      } else {
        toast('success', 'Investigation complete', 'AI assessment generated and policy evaluated.');
        await fetchCase();
      }
    } catch {
      toast('error', 'Network error', 'Could not reach investigation API.');
    } finally {
      setInvestigating(false);
    }
  }

  async function handleDecide(decision: 'approve' | 'mark_legitimate' | 'escalate' | 'mark_suspicious') {
    if (!caseData?.review_queue?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review-queue/${caseData.review_queue.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: reviewNotes || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast('error', 'Decision failed', json.error ?? 'Unknown error');
      } else {
        toast('success', `Decision recorded: ${decision.replace(/_/g, ' ')}`, 'Audit log updated.');
        await fetchCase();
      }
    } catch {
      toast('error', 'Network error', 'Could not reach review API.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageLoader message="Loading case…" />;
  if (error || !caseData) return <ErrorState message={error ?? 'Case not found'} onRetry={fetchCase} />;

  const tx  = caseData.transaction;
  const rs  = caseData.risk_score;
  const inv = caseData.investigation;
  const ai  = inv?.ai_decision ?? null;
  const rq  = caseData.review_queue;

  const hasInvestigation = !!inv?.ai_decision;
  const isResolved       = ['resolved', 'closed', 'escalated'].includes(caseData.status);
  const showReviewPanel  = !!rq && rq.status === 'pending' && canReview && !isResolved;

  return (
    <div className="space-y-5 animate-fade-in max-w-5xl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-lg font-bold text-slate-100">{caseData.case_number}</h1>
            <RiskBadge level={caseData.priority} />
            <Badge variant={
              caseData.status === 'resolved'  ? 'low' :
              caseData.status === 'escalated' ? 'critical' :
              caseData.status === 'investigating' ? 'blue' : 'default'
            }>
              {caseData.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">Opened {formatDate(caseData.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          {canInvestigate && !hasInvestigation && (
            <Button
              variant="primary"
              size="sm"
              loading={investigating}
              onClick={handleInvestigate}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
                </svg>
              }
            >
              {investigating ? 'Investigating…' : 'Investigate Case'}
            </Button>
          )}
          {canInvestigate && hasInvestigation && !isResolved && (
            <Button variant="secondary" size="sm" loading={investigating} onClick={handleInvestigate}>
              Re-investigate
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={fetchCase}>Refresh</Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-800 pb-0">
        {([
          { key: 'overview', label: 'Investigation' },
          { key: 'receipt',  label: 'Trust Receipt' },
          { key: 'audit',    label: `Audit Trail (${auditLogs.length})` },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">

          {/* Confidence banner — shown if AI investigation exists and confidence < 70 */}
          {ai && <ConfidenceBanner confidence={ai.confidence_score} />}

          {/* Two-column: transaction summary + score */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="sm:col-span-2">
              <CardHeader>
                <CardTitle>Transaction Summary</CardTitle>
                <Badge variant={tx?.dataset_split === 'test' ? 'purple' : 'default'}>
                  {tx?.dataset_split ?? '—'}
                </Badge>
              </CardHeader>
              {tx ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    { label: 'TX ID',     value: tx.external_tx_id, mono: true },
                    { label: 'Amount',    value: formatCurrency(tx.amount, tx.currency) },
                    { label: 'Method',    value: tx.payment_method.toUpperCase() },
                    { label: 'Status',    value: tx.payment_status },
                    { label: 'Hour',      value: tx.hour_of_day !== null ? `${tx.hour_of_day}:00` : '—' },
                    { label: 'Country',   value: `${tx.ip_country ?? '—'}${tx.is_international ? ' 🌐' : ''}` },
                    { label: 'Customer',  value: tx.customer ? maskId(tx.customer.external_id, 6) : '—' },
                    { label: 'Avg tx',    value: tx.customer?.avg_transaction_amount ? formatCurrency(tx.customer.avg_transaction_amount) : '—' },
                    { label: 'Account age', value: tx.customer?.account_age_days !== null ? `${tx.customer?.account_age_days} days` : '—' },
                    { label: 'Device',    value: tx.device ? `${tx.device.device_type ?? '?'} / ${tx.device.os ?? '?'}` : '—' },
                    { label: 'Device risk', value: tx.device?.is_known_fraudulent ? '⚠ Known fraudulent' : 'No flag', accent: tx.device?.is_known_fraudulent ? 'text-red-400' : 'text-emerald-400' },
                    { label: 'Date',      value: formatDate(tx.created_at) },
                  ].map(row => (
                    <div key={row.label}>
                      <dt className="text-xs text-slate-500 mb-0.5">{row.label}</dt>
                      <dd className={`text-sm font-medium ${row.accent ?? 'text-slate-200'} ${row.mono ? 'font-mono text-xs' : ''}`}>
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-slate-500">Transaction data unavailable.</p>
              )}
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="flex flex-col items-center justify-center py-6">
                <CardTitle className="mb-4 text-center">Risk Score</CardTitle>
                {rs ? (
                  <>
                    <ScoreGauge score={rs.score} level={rs.level} />
                    <p className="text-xs text-slate-500 mt-3 text-center">Model {rs.model_version}</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Not scored</p>
                )}
              </Card>

              {/* Policy result */}
              {rq?.policy_action && (
                <Card>
                  <CardTitle className="mb-2">Policy Decision</CardTitle>
                  <Badge variant={
                    rq.policy_action === 'escalate' ? 'critical' :
                    rq.policy_action === 'review'   ? 'high' :
                    rq.policy_action === 'verify'   ? 'medium' : 'low'
                  } className="text-sm px-3 py-1">
                    {rq.policy_action.toUpperCase()}
                  </Badge>
                  <p className="text-xs text-slate-500 mt-2">
                    Deterministic policy engine — AI cannot override this.
                  </p>
                </Card>
              )}
            </div>
          </div>

          {/* Signal breakdown */}
          {signals.length > 0 && (
            <Section title="Signal Breakdown">
              <div className="space-y-4">
                {signals.map(s => <SignalBar key={s.signal_type} signal={s} />)}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between text-sm">
                <span className="text-slate-500">Total contribution</span>
                <span className="font-bold text-slate-200">
                  {signals.reduce((acc, s) => acc + s.contribution, 0)} pts
                  {rs && ` → ${rs.score} score`}
                </span>
              </div>
            </Section>
          )}

          {/* Dual verdict */}
          {ai && (
            <Section title="Dual Verdict Comparison" accent="text-blue-300">
              <DualVerdict aiDecision={ai} />
            </Section>
          )}

          {/* AI investigation details */}
          {ai ? (
            <Section title="AI Investigation">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-purple-300 mb-1">Primary Finding</p>
                    <p className="text-sm text-slate-300">{ai.primary_reason}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reasoning</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{ai.reasoning_summary}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                      Supporting Evidence
                    </p>
                    <ul className="space-y-1.5">
                      {ai.supporting_evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                          <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                      Counter-Evidence
                    </p>
                    <ul className="space-y-1.5">
                      {ai.counter_evidence.length === 0 ? (
                        <li className="text-xs text-slate-500">No counter-evidence identified.</li>
                      ) : ai.counter_evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {ai.uncertainty_notes && (
                  <div className="rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-400 mb-1">Uncertainty Notes</p>
                    <p className="text-xs text-slate-500">{ai.uncertainty_notes}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800 pt-3">
                  <span>Model: {ai.model_used}</span>
                  <span>Generated: {formatDate(ai.created_at)}</span>
                </div>
              </div>
            </Section>
          ) : (
            <Section title="AI Investigation">
              {inv?.status === 'running' ? (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-400">Investigation in progress…</p>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-slate-400 mb-3">
                    No investigation has been run for this case yet.
                  </p>
                  {canInvestigate && (
                    <Button variant="primary" size="sm" loading={investigating} onClick={handleInvestigate}>
                      Run AI Investigation
                    </Button>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Counterfactual */}
          {signals.length > 0 && rs && (
            <Collapsible title="Counterfactual Analysis — What would change this score?" accent="text-violet-300">
              <CounterfactualPanel signals={signals} originalScore={rs.score} originalLevel={rs.level} />
            </Collapsible>
          )}

          {/* Human review panel */}
          {rq && (
            <Section title="Human Review">
              {rq.analyst_decision ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={
                      rq.analyst_decision === 'approve' || rq.analyst_decision === 'mark_legitimate' ? 'low' :
                      rq.analyst_decision === 'escalate' ? 'critical' : 'high'
                    }>
                      {rq.analyst_decision.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      by {rq.decider?.full_name ?? rq.decider?.email ?? 'Unknown'}
                      {rq.decided_at ? ` · ${formatDate(rq.decided_at)}` : ''}
                    </span>
                  </div>
                  {rq.analyst_notes && (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3">
                      <p className="text-xs text-slate-500">{rq.analyst_notes}</p>
                    </div>
                  )}
                </div>
              ) : showReviewPanel ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    This case is in your review queue.
                    {ai && ` AI recommends: `}
                    {ai && <span className="text-blue-300 font-medium">{ai.recommended_action}</span>}
                    {ai && ` — but policy has final say.`}
                  </p>
                  <Textarea
                    label="Analyst notes (optional)"
                    placeholder="Add notes for the audit trail…"
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    {([
                      { d: 'approve',         label: 'Approve',           variant: 'primary'    },
                      { d: 'mark_legitimate', label: 'Mark Legitimate',    variant: 'secondary'  },
                      { d: 'escalate',        label: 'Escalate',           variant: 'danger'     },
                      { d: 'mark_suspicious', label: 'Mark Suspicious',    variant: 'outline'    },
                    ] as const).map(btn => (
                      <Button
                        key={btn.d}
                        variant={btn.variant as 'primary' | 'secondary' | 'danger' | 'outline'}
                        size="sm"
                        loading={submitting}
                        onClick={() => handleDecide(btn.d)}
                      >
                        {btn.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  {isResolved ? `Case ${caseData.status}.` : 'Awaiting assignment to review queue.'}
                </p>
              )}
            </Section>
          )}
        </div>
      )}

      {/* ── TAB: TRUST RECEIPT ── */}
      {activeTab === 'receipt' && rs && (
        <Section title="Trust Receipt" accent="text-emerald-300">
          <p className="text-xs text-slate-500 mb-4">
            A compact, shareable summary of this case for compliance and audit purposes.
            Copy it to clipboard or screenshot it. Labelled with a timestamp.
          </p>
          <TrustReceipt caseData={caseData} signals={signals} aiDecision={ai} />
        </Section>
      )}

      {/* ── TAB: AUDIT TRAIL ── */}
      {activeTab === 'audit' && (
        <Section title="Audit Trail" accent="text-slate-300">
          <p className="text-xs text-slate-500 mb-4">
            Every event recorded for this case, from creation through investigation to decision.
            Audit records cannot be updated or deleted.
          </p>
          <AuditTimeline logs={auditLogs} />
        </Section>
      )}
    </div>
  );
}

export default function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <InvestigationContent id={id} />;
}
