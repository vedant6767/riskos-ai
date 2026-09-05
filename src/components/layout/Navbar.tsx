'use client';
import { usePathname } from 'next/navigation';
import { useSession } from '@/context/SessionContext';
import { Badge } from '@/components/ui/Badge';

const pageTitles: Record<string, { title: string; description: string }> = {
  '/dashboard':    { title: 'Dashboard',       description: 'Real-time risk overview' },
  '/transactions': { title: 'Transactions',    description: 'Explore and filter all transactions' },
  '/review-queue': { title: 'Review Queue',    description: 'Human review of flagged cases' },
  '/evaluation':   { title: 'Evaluation Lab',  description: 'Model performance on held-out test set' },
  '/admin':        { title: 'Admin',           description: 'User and organization management' },
};

export function Navbar({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();

  // Match exact or prefix
  const key = Object.keys(pageTitles).find(k => pathname === k || pathname.startsWith(k + '/'));
  const meta = key ? pageTitles[key] : { title: 'RiskOS AI', description: '' };

  const roleColors: Record<string, 'blue' | 'purple' | 'default'> = {
    ADMIN:        'purple',
    RISK_ANALYST: 'blue',
    MERCHANT:     'default',
    VIEWER:       'default',
  };

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm shrink-0">
      <div>
        <h1 className="text-sm font-semibold text-slate-200">{meta.title}</h1>
        {meta.description && (
          <p className="text-xs text-slate-500 hidden sm:block">{meta.description}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Cmd+K search trigger */}
        <button
          onClick={onSearchOpen}
          className="hidden sm:flex items-center gap-2 h-7 px-3 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors text-xs"
          aria-label="Open search (Cmd+K)"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          Search
          <kbd className="ml-1 text-slate-600 bg-slate-700 px-1 rounded text-xs">⌘K</kbd>
        </button>

        {user && (
          <>
            <Badge variant={roleColors[user.role] ?? 'default'}>
              {user.role}
            </Badge>
            <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <span className="text-xs font-bold text-blue-400">
                {(user.fullName ?? user.email).charAt(0).toUpperCase()}
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
