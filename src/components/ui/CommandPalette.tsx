'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { cn, formatCurrency, maskId } from '@/lib/utils';
import { RiskBadge } from './Badge';
import { Skeleton } from './Skeleton';

// ── types ──────────────────────────────────────────────────────────────────────
interface SearchResult {
  type: 'transaction' | 'case';
  id:   string;
  label: string;          // primary display line
  sub:   string;          // secondary line
  risk?: { score: number; level: string };
  href:  string;
}

// ── search API ─────────────────────────────────────────────────────────────────
async function search(query: string): Promise<SearchResult[]> {
  if (!query.trim() || query.length < 2) return [];
  try {
    const params = new URLSearchParams({ search: query, limit: '8' });
    const [txRes, caseRes] = await Promise.all([
      fetch(`/api/transactions?${params}`,         { cache: 'no-store' }),
      fetch(`/api/cases?search=${encodeURIComponent(query)}&limit=5`, { cache: 'no-store' }),
    ]);

    const results: SearchResult[] = [];

    if (txRes.ok) {
      const { transactions = [] } = await txRes.json();
      for (const tx of transactions.slice(0, 6)) {
        const rs = Array.isArray(tx.risk_scores) ? tx.risk_scores[0] : tx.risk_scores;
        results.push({
          type:  'transaction',
          id:    tx.id,
          label: tx.external_tx_id,
          sub:   `${formatCurrency(tx.amount)} · ${tx.payment_method?.toUpperCase()} · ${tx.customer ? maskId(tx.customer.external_id, 6) : '—'}`,
          risk:  rs ? { score: rs.score, level: rs.level } : undefined,
          href:  '/transactions',
        });
      }
    }

    if (caseRes.ok) {
      const { cases = [] } = await caseRes.json();
      for (const c of cases.slice(0, 4)) {
        const tx = Array.isArray(c.transaction) ? c.transaction[0] : c.transaction;
        const rs = Array.isArray(c.risk_score)  ? c.risk_score[0]  : c.risk_score;
        results.push({
          type:  'case',
          id:    c.id,
          label: c.case_number,
          sub:   `${tx ? formatCurrency(tx.amount) : '—'} · ${c.status} · ${c.priority}`,
          risk:  rs ? { score: rs.score, level: rs.level } : undefined,
          href:  `/investigations/${c.id}`,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ── icon helpers ───────────────────────────────────────────────────────────────
function TxIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}
function CaseIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

// ── QUICK NAV items shown when query is empty ──────────────────────────────────
const QUICK_NAV = [
  { label: 'Dashboard',       href: '/dashboard',    kbd: 'G D' },
  { label: 'Transactions',    href: '/transactions', kbd: 'G T' },
  { label: 'Review Queue',    href: '/review-queue', kbd: 'G R' },
  { label: 'Evaluation Lab',  href: '/evaluation',   kbd: 'G E' },
];

// ── palette component ──────────────────────────────────────────────────────────
function Palette({ onClose }: { onClose: () => void }) {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);

  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(0);

  // Debounced search
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!query.trim() || query.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      const r = await search(query);
      setResults(r);
      setSelected(0);
      setLoading(false);
    }, 250);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Reset selection when results change
  useEffect(() => { setSelected(0); }, [results]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const total = query ? results.length : QUICK_NAV.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelected(s => Math.min(s + 1, total - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelected(s => Math.max(s - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (query && results[selected]) navigate(results[selected].href);
        else if (!query && QUICK_NAV[selected]) navigate(QUICK_NAV[selected].href);
        break;
      case 'Escape':
        onClose();
        break;
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search transactions, cases…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
              aria-label="Clear search"
            >×</button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-slate-500 bg-slate-800 rounded border border-slate-700">
            Esc
          </kbd>
        </div>

        {/* Results list */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-48" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !query && (
            <div className="py-2">
              <p className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Quick navigation
              </p>
              <ul ref={listRef} role="listbox">
                {QUICK_NAV.map((nav, i) => (
                  <li
                    key={nav.href}
                    role="option"
                    aria-selected={selected === i}
                    onClick={() => navigate(nav.href)}
                    className={cn(
                      'flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors',
                      selected === i ? 'bg-blue-500/10' : 'hover:bg-slate-800/50'
                    )}
                  >
                    <span className="text-sm text-slate-300">{nav.label}</span>
                    <kbd className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                      {nav.kbd}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-500">
                No results for <span className="text-slate-300">&ldquo;{query}&rdquo;</span>
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2">
              {/* Group by type */}
              {(['transaction', 'case'] as const).map(type => {
                const group = results.filter(r => r.type === type);
                if (!group.length) return null;
                const allResults = results;
                return (
                  <div key={type}>
                    <p className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {type === 'transaction' ? 'Transactions' : 'Risk Cases'}
                    </p>
                    <ul ref={type === 'transaction' ? listRef : undefined} role="listbox">
                      {group.map(result => {
                        const idx = allResults.indexOf(result);
                        return (
                          <li
                            key={result.id}
                            role="option"
                            aria-selected={selected === idx}
                            onClick={() => navigate(result.href)}
                            className={cn(
                              'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                              selected === idx ? 'bg-blue-500/10' : 'hover:bg-slate-800/50'
                            )}
                          >
                            <span className={cn(
                              'shrink-0 w-6 h-6 rounded flex items-center justify-center',
                              type === 'transaction' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                            )}>
                              {type === 'transaction' ? <TxIcon /> : <CaseIcon />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-200 font-mono truncate">{result.label}</p>
                              <p className="text-xs text-slate-500 truncate">{result.sub}</p>
                            </div>
                            {result.risk && (
                              <RiskBadge level={result.risk.level} score={result.risk.score} />
                            )}
                            {selected === idx && (
                              <span className="text-xs text-slate-500 shrink-0">↵</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-800 text-xs text-slate-600">
          <span className="flex items-center gap-1"><kbd className="bg-slate-800 border border-slate-700 rounded px-1">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-800 border border-slate-700 rounded px-1">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-800 border border-slate-700 rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ── exported hook + trigger ────────────────────────────────────────────────────
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      // Global quick-nav shortcuts (g + letter) — only when no input is focused
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!inInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'g') {
          // handled by next keypress — simple state machine not needed for MVP
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return { open, setOpen };
}

/** Renders the palette portal when open. Mount once in AppShell. */
export function CommandPalettePortal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !open) return null;
  return createPortal(<Palette onClose={onClose} />, document.body);
}
