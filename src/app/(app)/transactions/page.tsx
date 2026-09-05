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

// ── filter options ─────────────────────────────────────────────────────────────
const LEVEL_OPTIONS   = [
  { value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' },
];
const METHOD_OPTIONS  = [
  { value: 'card', label: 'Card' }, { value: 'upi', label: 'UPI' },
  { value: 'netbanking', label: 'Net Banking' }, { value: 'wallet', label: 'Wallet' },
  { value: 'emi', label: 'EMI' }, { value: 'bnpl', label: 'BNPL' },
];
const STATUS_OPTIONS  = [
  { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' }, { value: 'refunded', label: 'Refunded' },
  { value: 'disputed', label: 'Disputed' },
];
const SPLIT_OPTIONS   = [
  { value: 'dev', label: 'Dev set' }, { value: 'test', label: 'Held-out test' },
  { value: 'live', label: 'Live' },
];

// ── filter chip ────────────────────────────────────────────────────────────────
function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
      <span className="text-blue-500">{label}:</span> {value}
      <button
        onClick={onRemove}
        className="hover:text-white transition-colors ml-0.5"
        aria-label={`Remove ${label} filter`}
      >×</button>
    </span>
  );
}

function statusVariant(s: string): 'low' | 'critical' | 'medium' | 'default' {
  switch (s) {
    case 'success':  return 'low';
    case 'disputed': return 'critical';
    case 'failed':   return 'medium';
    default:         return 'default';
  }
}

// ── table row skeleton ─────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-800/60">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-3 bg-slate-800 rounded w-28 animate-pulse" />
          <div className="h-3 bg-slate-800 rounded w-16 animate-pulse" />
          <div className="h-3 bg-slate-800 rounded w-20 animate-pulse" />
          <div className="h-5 bg-slate-800 rounded-full w-12 animate-pulse" />
          <div className="h-5 bg-slate-800 rounded-full w-16 animate-pulse" />
          <div className="h-5 bg-slate-800 rounded-full w-20 animate-pulse" />
          <div className="h-3 bg-slate-800 rounded w-10 animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ── main inner component ───────────────────────────────────────────────────────
function TransactionsInner() {
  const router      = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [level,  setLevel]  = useState(searchParams.get('level')  ?? '');
  const [method, setMethod] = useState(searchParams.get('method') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [split,  setSplit]  = useState(searchParams.get('split')  ?? '');

  // Cursor stack: [null, cursor1, cursor2, ...] — null = first page
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [currentPage, setCurrentPage] = useState(0); // index into cursorStack
  const [nextCursor,  setNextCursor]  = useState<string | null>(null);
  const [total,       setTotal]       = useState<number>(0);

  const [rows,    setRows]    = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (cursor)  params.set('cursor', cursor);
      if (search)  params.set('search', search);
      if (level)   params.set('level',  level);
      if (method)  params.set('method', method);
      if (status)  params.set('status', status);
      if (split)   params.set('split',  split);

      const res = await fetch(`/api/transactions?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load transactions');
      const data = await res.json();

      // Normalise risk_scores (Supabase returns array for joined table)
      const txs = (data.transactions ?? []).map((tx: TxRow & { risk_scores: unknown }) => ({
        ...tx,
        risk_scores: Array.isArray(tx.risk_scores)
          ? (tx.risk_scores[0] as TxRow['risk_scores'] ?? null)
          : (tx.risk_scores as TxRow['risk_scores']),
      }));

      setRows(txs);
      setNextCursor(data.nextCursor ?? null);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [search, level, method, status, split]);

  // Reset to first page when filters change
  function resetCursor() {
    setCursorStack([null]);
    setCurrentPage(0);
  }

  // Fetch when cursor page changes
  useEffect(() => {
    fetchPage(cursorStack[currentPage] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorStack, currentPage, level, method, status, split]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      resetCursor();
      fetchPage(null);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function goNext() {
    if (!nextCursor) return;
    const newStack = [...cursorStack.slice(0, currentPage + 1), nextCursor];
    setCursorStack(newStack);
    setCurrentPage(currentPage + 1);
  }

  function goPrev() {
    if (currentPage === 0) return;
    setCurrentPage(currentPage - 1);
  }

  function onFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      resetCursor();
    };
  }

  const hasFilters = !!(search || level || method || status || split);

  // Active filter chips
  const chips: { label: string; value: string; clear: () => void }[] = [
    ...(level  ? [{ label: 'Risk',    value: level,  clear: () => { setLevel('');  resetCursor(); } }] : []),
    ...(method ? [{ label: 'Method',  value: method, clear: () => { setMethod(''); resetCursor(); } }] : []),
    ...(status ? [{ label: 'Status',  value: status, clear: () => { setStatus(''); resetCursor(); } }] : []),
    ...(split  ? [{ label: 'Dataset', value: split,  clear: () => { setSplit('');  resetCursor(); } }] : []),
    ...(search ? [{ label: 'Search',  value: search, clear: () => { setSearch(''); resetCursor(); } }] : []),
  ];

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm pb-2">
        <Card padding="sm">
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <Input
                placeholder="Search by TX ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search transactions"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                }
              />
            </div>
            <div className="w-36">
              <Select options={LEVEL_OPTIONS}  placeholder="All risk levels" value={level}  onChange={onFilterChange(setLevel)}  aria-label="Filter by risk level" />
            </div>
            <div className="w-36">
              <Select options={METHOD_OPTIONS} placeholder="All methods"     value={method} onChange={onFilterChange(setMethod)} aria-label="Filter by payment method" />
            </div>
            <div className="w-32">
              <Select options={STATUS_OPTIONS} placeholder="All statuses"    value={status} onChange={onFilterChange(setStatus)} aria-label="Filter by status" />
            </div>
            <div className="w-40">
              <Select options={SPLIT_OPTIONS}  placeholder="All datasets"    value={split}  onChange={onFilterChange(setSplit)}  aria-label="Filter by dataset" />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="md" onClick={() => {
                setSearch(''); setLevel(''); setMethod(''); setStatus(''); setSplit('');
                resetCursor();
              }}>
                Clear all
              </Button>
            )}
          </div>

          {/* Active filter chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {chips.map(c => (
                <FilterChip key={c.label} label={c.label} value={c.value} onRemove={c.clear} />
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2">
            {total.toLocaleString('en-IN')} transaction{total !== 1 ? 's' : ''}
            {hasFilters ? ' matching filters' : ' total'}
            {currentPage > 0 ? ` · page ${currentPage + 1}` : ''}
          </p>
        </Card>
      </div>

      {/* Content */}
      {error ? (
        <ErrorState message={error} onRetry={() => fetchPage(cursorStack[currentPage] ?? null)} />
      ) : (
        <Card padding="none">
          {/* Table header */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Transaction list">
              <thead>
                <tr className="border-b border-slate-800">
                  {['TX ID', 'Customer', 'Amount', 'Method', 'Status', 'Risk', 'Hour', 'Device', 'Dataset', 'Date', ''].map(h => (
                    <th key={h} scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              {loading ? (
                <tbody>
                  <tr><td colSpan={11} className="p-0"><TableSkeleton /></td></tr>
                </tbody>
              ) : rows.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={11}>
                      <EmptyState
                        title="No transactions found"
                        description={hasFilters ? 'Try adjusting your filters.' : 'Seed data from the dashboard to get started.'}
                        action={hasFilters
                          ? <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setLevel(''); setMethod(''); setStatus(''); setSplit(''); resetCursor(); }}>Clear filters</Button>
                          : undefined}
                        icon={
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody className="divide-y divide-slate-800/60">
                  {rows.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                        {tx.external_tx_id}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {tx.customer ? maskId(tx.customer.external_id, 6) : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-200 whitespace-nowrap">
                        {formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="default">{tx.payment_method.toUpperCase()}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant={statusVariant(tx.payment_status)}>{tx.payment_status}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx.risk_scores
                          ? <RiskBadge level={tx.risk_scores.level} score={tx.risk_scores.score} />
                          : <span className="text-xs text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {tx.hour_of_day !== null ? `${tx.hour_of_day}:00` : '—'}
                        {tx.is_international && <span className="ml-1 text-amber-500" title="International">🌐</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx.device
                          ? <span className={`text-xs ${tx.device.is_known_fraudulent ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
                              {tx.device.device_type ?? '?'}{tx.device.is_known_fraudulent ? ' ⚠' : ''}
                            </span>
                          : <span className="text-xs text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx.dataset_split
                          ? <Badge variant={tx.dataset_split === 'test' ? 'purple' : tx.dataset_split === 'live' ? 'blue' : 'ghost'}>{tx.dataset_split}</Badge>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx.risk_scores && (tx.risk_scores.level === 'HIGH' || tx.risk_scores.level === 'CRITICAL')
                          ? <button
                              onClick={() => router.push('/review-queue')}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >View case →</button>
                          : <span className="text-xs text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>

          {/* Cursor pagination */}
          {(currentPage > 0 || nextCursor) && (
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Page {currentPage + 1}
                {total > 0 ? ` · ~${total.toLocaleString('en-IN')} total` : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={goPrev}>
                  ← Prev
                </Button>
                <Button variant="outline" size="sm" disabled={!nextCursor} onClick={goNext}>
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
