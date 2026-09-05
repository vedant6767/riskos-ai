'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/context/SessionContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  role: string;
  created_at: string;
  user: { id: string; email: string; full_name: string | null; created_at: string } | null;
}
interface Org { name: string; slug: string; plan: string; created_at: string }
interface Stats {
  totalTransactions: number; totalCases: number; pendingReview: number; memberCount: number;
}

const ROLE_COLORS: Record<string, 'purple' | 'blue' | 'default'> = {
  ADMIN: 'purple', RISK_ANALYST: 'blue', MERCHANT: 'default', VIEWER: 'default',
};

export default function AdminPage() {
  const { user } = useSession();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (res.status === 403) {
        setError('Admin access required. This page is restricted to ADMIN role.');
        return;
      }
      if (!res.ok) throw new Error('Failed to load admin data');
      const data = await res.json();
      setMembers(data.members ?? []);
      setOrg(data.org ?? null);
      setStats(data.stats ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast('error', 'Seed failed', json.error ?? 'Unknown error');
      } else if (json.count > 100) {
        toast('info', 'Already seeded', `${json.count} transactions already exist.`);
      } else {
        toast('success', 'Data seeded!', json.message);
      }
    } catch {
      toast('error', 'Network error', 'Could not reach seed API.');
    } finally {
      setSeeding(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-300">Admin access required</p>
          <p className="text-xs text-slate-500 mt-1">
            This page is restricted to the ADMIN role.
            Your current role is: <span className="text-blue-400">{user?.role}</span>
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <PageLoader message="Loading admin panel…" />;
  if (error)   return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">

      {/* Org overview */}
      {org && (
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <Badge variant="blue">{org.plan}</Badge>
          </CardHeader>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Name',    value: org.name },
              { label: 'Slug',    value: org.slug },
              { label: 'Plan',    value: org.plan },
              { label: 'Created', value: formatDate(org.created_at) },
            ].map(row => (
              <div key={row.label}>
                <dt className="text-xs text-slate-500 mb-0.5">{row.label}</dt>
                <dd className="text-sm font-medium text-slate-200">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Transactions', value: stats.totalTransactions.toLocaleString('en-IN'), accent: 'text-slate-100' },
            { label: 'Risk Cases',         value: stats.totalCases.toLocaleString('en-IN'),        accent: 'text-orange-400' },
            { label: 'Pending Review',     value: stats.pendingReview.toLocaleString('en-IN'),     accent: stats.pendingReview > 0 ? 'text-amber-400' : 'text-slate-100' },
            { label: 'Team Members',       value: stats.memberCount.toLocaleString('en-IN'),       accent: 'text-blue-400' },
          ].map(s => (
            <Card key={s.label}>
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.accent}`}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Data management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          <div className="flex-1">
            <p className="text-sm text-slate-400 mb-1">Seed Synthetic Dataset</p>
            <p className="text-xs text-slate-500">
              Generates 2,000 synthetic transactions (1,400 dev / 600 held-out test set),
              customers, devices, risk scores, cases, and default policy. Safe to call multiple times — idempotent.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={seeding}
            onClick={handleSeed}
          >
            {seeding ? 'Seeding…' : 'Seed Demo Data'}
          </Button>
        </div>
      </Card>

      {/* Team members */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <CardTitle>Team Members ({members.length})</CardTitle>
        </div>
        {members.length === 0 ? (
          <EmptyState title="No members found" />
        ) : (
          <div className="divide-y divide-slate-800/60">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-400">
                      {(m.user?.full_name ?? m.user?.email ?? '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {m.user?.full_name ?? '—'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{m.user?.email ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <Badge variant={ROLE_COLORS[m.role] ?? 'default'}>{m.role}</Badge>
                  <span className="text-xs text-slate-600 hidden sm:block">
                    {formatDate(m.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Security info */}
      <Card>
        <CardHeader>
          <CardTitle>Security Status</CardTitle>
        </CardHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: 'Row-Level Security',    status: 'Enabled',    ok: true,  desc: 'All tables isolated by org_id via Supabase RLS' },
            { label: 'Append-Only Audit Log', status: 'Enforced',   ok: true,  desc: 'UPDATE/DELETE rules prevent audit tampering' },
            { label: 'Server-Side Auth',      status: 'Active',     ok: true,  desc: 'getUser() validates JWT with Supabase on every request' },
            { label: 'AI Key Exposure',       status: 'None',       ok: true,  desc: 'GEMINI_API_KEY never reaches the browser bundle' },
            { label: 'Prompt Injection',      status: 'Defended',   ok: true,  desc: 'Transaction data placed in delimited untrusted blocks' },
            { label: 'Structured AI Output',  status: 'Validated',  ok: true,  desc: 'All Gemini responses validated with Zod schema' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.ok ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden="true" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-300">{item.label}</p>
                  <span className={`text-xs ${item.ok ? 'text-emerald-400' : 'text-red-400'}`}>{item.status}</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
