'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge, RiskBadge } from '@/components/ui/Badge';
import { PageLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatCurrency, formatDate, maskId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ── types ──────────────────────────────────────────────────────────────────────
interface TxRow {
  id: string;
  external_tx_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  hour_of_day: number | null;
  is_international: boolean;
  dataset_split: string | null;
  created_at: string;
  customer: { external_id: string; avg_transaction_amount: number | null } | null;
  device: { device_type: string | null; os: string | null; is_known_fraudulent: boolean } | null;
  risk_scores: { score: number; level: string; model_version: string } | null;
}

interface Pagination { page: number; limit: number; total: number; pages: number }

// ── filter options ─────────────────────────────────────────────────────────────
const LEVEL_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];
const METHOD_OPTIONS = [
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'netbanking', label: 'Net Banking' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'emi', label: 'EMI' },
  { value: 'bnpl', label: 'BNPL' },
];
const STATUS_OPTIONS = [
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'disputed', label: 'Disputed' },
];
const SPLIT_OPTIONS = [
  { value: 'dev', label: 'Dev set' },
  { value: 'test', label: 'Test set (held-out)' },
  { value: 'live', label: 'Live' },
];

// ── helpers ────────────────────────────────────────────────────────────────────
function statusVariant(s: string): 'low' | 'critical' | 'medium' | 'default' {
  switch (s) {
    case 'success':  return 'low';
    case 'disputed': return 'critical';
    case 'failed':   return 'medium';
    default:         return 'default';
  }
}

// ── page ───────────────────────────────────────────────────────────────────────
function TransactionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialise filters from URL query params (supports ?level=HIGH deeplink)
  const [search,  setSearch]  = useState(searchParams.get('search') ?? '');
  const [level,   setLevel]   = useState(searchParams.get('level')  ?? '');
  const [method,  setMethod]  = useState(searchParams.get('method') ?? '');
  const [status,  setStatus]  = useState(searchParams.get('status') ?? '');
  const [split,   setSplit]   = useState(searchParams.get('split')  ?? '');
  const [page,    setPage]    = useState(1);

  const [rows,    setRows]    = useState<TxRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Debounce search input
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTransactions = useCallback(async (overridePage = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search)  params.set('search', search);
      if (level)   params.set('level', level);
      if (method)  params.set('method', method);
      if (status)  params.set('status', status);
      if (split)   params.set('split', split);
      params.set('page', String(overridePage));
      params.set('limit', '25');

      const res = await fetch(`/api/transactions?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load transactions');
      const data = await res.json();
      setRows(data.transactions ?? []);
      setPagination(data.pagination ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [search, level, method, status, split, page]);

  // Fetch on filter/page change
  useEffect(() => {
    fetchTransactions(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, method, status, split, page]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchTransactions(1);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function resetFilters() {
    setSearch(''); setLevel(''); setMethod(''); setStatus(''); setSplit(''); setPage(1);
  }

  const hasFilters = !!(search || level || method || status || split);

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Filter bar */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <Input
              placeholder="Search by TX ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              }
              aria-label="Search transactions"
            />
          </div>
          <div className="w-36">
            <Select
              options={LEVEL_OPTIONS}
              placeholder="All risk levels"
              value={level}
              onChange={e => { setLevel(e.target.value); setPage(1); }}
              aria-label="Filter by risk level"
            />
          </div>
          <div className="w-36">
            <Select
              options={METHOD_OPTIONS}
              placeholder="All methods"
              value={method}
              onChange={e => { setMethod(e.target.value); setPage(1); }}
              aria-label="Filter by payment method"
            />
          </div>
          <div className="w-32">
            <Select
              options={STATUS_OPTIONS}
              placeholder="All statuses"
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              aria-label="Filter by payment status"
            />
          </div>
          <div className="w-40">
            <Select
              options={SPLIT_OPTIONS}
              placeholder="All datasets"
              value={split}
              onChange={e => { setSplit(e.target.value); setPage(1); }}
              aria-label="Filter by dataset split"
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="md" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </div>
        {pagination && (
          <p className="text-xs text-slate-500 mt-2">
            {pagination.total.toLocaleString('en-IN')} transaction{pagination.total !== 1 ? 's' : ''}
            {hasFilters ? ' matching filters' : ' total'}
          </p>
        )}
      </Card>

      {/* Table */}
      {error ? (
        <ErrorState message={error} onRetry={() => fetchTransactions(page)} />
      ) : loading ? (
        <PageLoader message="Loading transactions…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description={hasFilters ? 'Try adjusting your filters.' : 'Seed data from the dashboard to get started.'}
          action={hasFilters ? <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button> : undefined}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          }
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Transaction list">
              <thead>
                <tr className="border-b border-slate-800">
                  {['TX ID', 'Customer', 'Amount', 'Method', 'Status', 'Risk', 'Hour', 'Device', 'Dataset', 'Date', ''].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                      scope="col"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rows.map(tx => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-800/20 transition-colors"
                  >
                    {/* TX ID */}
                    <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                      {tx.external_tx_id}
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {tx.customer ? maskId(tx.customer.external_id, 6) : '—'}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 font-semibold text-slate-200 whitespace-nowrap">
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>

                    {/* Method */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant="default">{tx.payment_method.toUpperCase()}</Badge>
                    </td>

                    {/* Payment status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={statusVariant(tx.payment_status)}>{tx.payment_status}</Badge>
                    </td>

                    {/* Risk */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {tx.risk_scores ? (
                        <RiskBadge level={tx.risk_scores.level} score={tx.risk_scores.score} />
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>

                    {/* Hour */}
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {tx.hour_of_day !== null ? `${tx.hour_of_day}:00` : '—'}
                      {tx.is_international && (
                        <span className="ml-1 text-xs text-amber-500" title="International">🌐</span>
                      )}
                    </td>

                    {/* Device */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {tx.device ? (
                        <span className={`text-xs ${tx.device.is_known_fraudulent ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
                          {tx.device.device_type ?? '?'}{tx.device.is_known_fraudulent ? ' ⚠' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>

                    {/* Dataset split */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {tx.dataset_split ? (
                        <Badge variant={tx.dataset_split === 'test' ? 'purple' : tx.dataset_split === 'live' ? 'blue' : 'ghost'}>
                          {tx.dataset_split}
                        </Badge>
                      ) : '—'}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(tx.created_at)}
                    </td>

                    {/* Actions — link to case if high/critical */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {tx.risk_scores && (tx.risk_scores.level === 'HIGH' || tx.risk_scores.level === 'CRITICAL') ? (
                        <button
                          onClick={() => router.push(`/review-queue`)}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          aria-label={`View case for ${tx.external_tx_id}`}
                        >
                          View case →
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Page {pagination.page} of {pagination.pages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<PageLoader message="Loading transactions…" />}>
      <TransactionsInner />
    </Suspense>
  );
}
