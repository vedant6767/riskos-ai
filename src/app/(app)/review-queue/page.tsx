'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/components/ui/Toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, RiskBadge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatCurrency, formatDate, maskId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ── types ──────────────────────────────────────────────────────────────────────
interface QueueItem {
  id: string;
  status: string;
  priority: string;
  policy_action: string | null;
  analyst_decision: string | null;
  analyst_notes: string | null;
  decided_at: string | null;
  created_at: string;
  transaction: {
    id: string;
    external_tx_id: string;
    amount: number;
    currency: string;
    payment_method: string;
    payment_status: string;
    created_at: string;
    customer: { external_id: string } | null;
  } | null;
  case: { id: string; case_number: string; status: string } | null;
  investigation: {
    id: string;
    status: string;
    ai_decision: {
      risk_assessment: string;
      confidence_score: number;
      primary_reason: string;
      recommended_action: string;
      engine_verdict: string;
      ai_verdict: string;
      verdicts_agree: boolean | null;
    } | null;
  } | null;
}

interface Pagination { page: number; limit: number; total: number; pages: number }

const STATUS_OPTIONS = [
  { value: 'pending',    label: 'Pending' },
  { value: 'in_review',  label: 'In Review' },
  { value: 'approved',   label: 'Approved' },
  { value: 'legitimate', label: 'Legitimate' },
  { value: 'rejected',   label: 'Rejected' },
  { value: 'escalated',  label: 'Escalated' },
];

const PRIORITY_OPTIONS = [
  { value: 'LOW',      label: 'Low' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'HIGH',     label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const DECISIONS = [
  { value: 'approve',         label: 'Approve',        variant: 'primary'   as const },
  { value: 'mark_legitimate', label: 'Legitimate',     variant: 'secondary' as const },
  { value: 'escalate',        label: 'Escalate',       variant: 'danger'    as const },
  { value: 'mark_suspicious', label: 'Suspicious',     variant: 'outline'   as const },
] as const;

// ── verdict disagreement pill ──────────────────────────────────────────────────
function VerdictPills({ ai }: { ai: QueueItem['investigation'] }) {
  const d = ai?.ai_decision;
  if (!d) return null;
  const agree = d.verdicts_agree;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-slate-500">Engine:</span>
      <RiskBadge level={d.engine_verdict} />
      <span className="text-xs text-slate-500">AI:</span>
      <RiskBadge level={d.ai_verdict} />
      {!agree && (
        <span className="text-xs font-bold text-amber-400 ml-1">⚠ Disagree</span>
      )}
      <span className="text-xs text-slate-500 ml-1">{d.confidence_score}% conf.</span>
    </div>
  );
}

// ── expandable row ─────────────────────────────────────────────────────────────
function QueueRow({
  item,
  canDecide,
  onDecide,
}: {
  item: QueueItem;
  canDecide: boolean;
  onDecide: (id: string, decision: string, notes: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isPending = item.status === 'pending' || item.status === 'in_review';
  const tx = item.transaction;
  const ai = item.investigation?.ai_decision;

  async function submit(decision: string) {
    setSubmitting(true);
    await onDecide(item.id, decision, notes);
    setSubmitting(false);
    setExpanded(false);
  }

  return (
    <div className="border-b border-slate-800/60 last:border-0">
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/20 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <RiskBadge level={item.priority} />

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono text-slate-300">
              {item.case?.case_number ?? '—'}
            </span>
            <span className="text-xs text-slate-500">
              {tx?.external_tx_id ?? '—'}
            </span>
            {tx?.customer && (
              <span className="text-xs text-slate-600">
                {maskId(tx.customer.external_id, 6)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {tx && (
              <span className="text-sm font-semibold text-slate-200">
                {formatCurrency(tx.amount, tx.currency)}
              </span>
            )}
            <Badge variant={item.policy_action === 'escalate' ? 'critical' : item.policy_action === 'review' ? 'high' : 'default'}>
              Policy: {item.policy_action ?? '—'}
            </Badge>
            {ai && (
              <span className="text-xs text-slate-500">
                AI: <span className="text-blue-400">{ai.recommended_action}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Badge variant={
            item.status === 'approved' || item.status === 'legitimate' ? 'low' :
            item.status === 'escalated' ? 'critical' :
            item.status === 'pending'   ? 'medium' : 'default'
          }>
            {item.status}
          </Badge>
          <span className="text-xs text-slate-500 hidden sm:block">{formatDate(item.created_at)}</span>
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 bg-slate-900/30">
          {/* Verdict comparison */}
          {item.investigation && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Verdicts</p>
              <VerdictPills ai={item.investigation} />
              {ai && !ai.verdicts_agree && (
                <p className="text-xs text-amber-400 mt-1.5">
                  ⚠ Engine and AI disagree — review carefully.
                </p>
              )}
              {ai && (
                <p className="text-xs text-slate-400 mt-2 italic">&ldquo;{ai.primary_reason}&rdquo;</p>
              )}
            </div>
          )}

          {/* Links */}
          <div className="flex items-center gap-3">
            {item.case?.id && (
              <Link
                href={`/investigations/${item.case.id}`}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Open full investigation →
              </Link>
            )}
          </div>

          {/* Decision panel */}
          {isPending && canDecide ? (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Make Decision</p>
              <Textarea
                placeholder="Add analyst notes (optional — recorded in audit log)…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map(d => (
                  <Button
                    key={d.value}
                    variant={d.variant}
                    size="sm"
                    loading={submitting}
                    onClick={() => submit(d.value)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : item.analyst_decision ? (
            <div className="pt-2 border-t border-slate-800 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Decision</p>
              <div className="flex items-center gap-2">
                <Badge variant={
                  item.analyst_decision === 'approve' || item.analyst_decision === 'mark_legitimate' ? 'low' :
                  item.analyst_decision === 'escalate' ? 'critical' : 'high'
                }>
                  {item.analyst_decision.replace(/_/g, ' ')}
                </Badge>
                <span className="text-xs text-slate-500">
                  {item.decided_at ? formatDate(item.decided_at) : '—'}
                </span>
              </div>
              {item.analyst_notes && (
                <p className="text-xs text-slate-400 italic">&ldquo;{item.analyst_notes}&rdquo;</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────
export default function ReviewQueuePage() {
  const { user } = useSession();
  const toast = useToast();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);

  const canDecide = ['ADMIN', 'RISK_ANALYST'].includes(user?.role ?? '');

  const fetchQueue = useCallback(async (pg = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '20' });
      if (statusFilter)   params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      const res = await fetch(`/api/review-queue?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load review queue');
      const data = await res.json();
      setItems(data.items ?? []);
      setPagination(data.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, page]);

  useEffect(() => {
    fetchQueue(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter, page]);

  async function handleDecide(queueId: string, decision: string, notes: string) {
    try {
      const res = await fetch(`/api/review-queue/${queueId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: notes || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast('error', 'Decision failed', json.error ?? 'Unknown error');
      } else {
        toast('success', `Decision: ${decision.replace(/_/g, ' ')}`, 'Recorded in audit log.');
        await fetchQueue(page);
      }
    } catch {
      toast('error', 'Network error', 'Could not reach review API.');
    }
  }

  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-100">
            Review Queue
            {pagination && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                {pagination.total.toLocaleString('en-IN')} cases
              </span>
            )}
          </h2>
          {pendingCount > 0 && statusFilter === 'pending' && (
            <p className="text-xs text-amber-400 mt-0.5">
              {pendingCount} case{pendingCount !== 1 ? 's' : ''} awaiting decision on this page
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchQueue(page)}>Refresh</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="w-36">
          <Select
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Filter by status"
          />
        </div>
        <div className="w-32">
          <Select
            options={PRIORITY_OPTIONS}
            placeholder="All priorities"
            value={priorityFilter}
            onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}
            aria-label="Filter by priority"
          />
        </div>
        {(statusFilter || priorityFilter) && (
          <Button variant="ghost" size="md" onClick={() => { setStatusFilter(''); setPriorityFilter(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Policy engine note */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-400">
        <strong>Policy gate:</strong> Every case here was routed by the deterministic policy engine.
        AI recommendations are shown for context only — the final decision is always made by a human analyst.
      </div>

      {/* Content */}
      {error ? (
        <ErrorState message={error} onRetry={() => fetchQueue(page)} />
      ) : loading ? (
        <PageLoader message="Loading review queue…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No cases in queue"
          description={statusFilter === 'pending' ? 'No pending cases — queue is clear.' : 'No cases match the selected filters.'}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          }
        />
      ) : (
        <Card padding="none">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[80px_1fr_200px_120px_100px] gap-4 px-5 py-2.5 border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Priority</span>
            <span>Case / Transaction</span>
            <span>Verdicts</span>
            <span>Status</span>
            <span>Date</span>
          </div>
          {items.map(item => (
            <QueueRow
              key={item.id}
              item={item}
              canDecide={canDecide}
              onDecide={handleDecide}
            />
          ))}
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              ← Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
