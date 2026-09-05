'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSession } from '@/context/SessionContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, RiskBadge } from '@/components/ui/Badge';
import { PageLoader } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDateShort } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ── types ──────────────────────────────────────────────────────────────────────

interface DashboardData {
  stats: {
    totalTransactions: number;
    highRiskCount: number;
    criticalCount: number;
    activeInvestigations: number;
    pendingReview: number;
    avgRiskScore: number;
  };
  trendData: { date: string; total: number; high: number; avgScore: number }[];
  riskDistribution: Record<string, number>;
  recentHighRisk: {
    score: number;
    level: string;
    calculated_at: string;
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
  }[];
}

// ── chart colours ──────────────────────────────────────────────────────────────
const DIST_COLORS: Record<string, string> = {
  LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444',
};

// ── stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent,
}: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </Card>
  );
}

// ── custom tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useSession();
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [spiking, setSpiking] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load dashboard');
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast('error', 'Seed failed', json.error ?? 'Unknown error');
      } else if (json.count > 100) {
        toast('info', 'Already seeded', `${json.count} transactions exist.`);
      } else {
        toast('success', 'Data seeded!', json.message);
        await fetchDashboard();
      }
    } catch {
      toast('error', 'Seed failed', 'Network error');
    } finally {
      setSeeding(false);
    }
  }

  async function handleSpike() {
    setSpiking(true);
    try {
      const res = await fetch('/api/simulate-spike', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast('error', 'Simulation failed', json.error ?? 'Unknown error');
      } else {
        toast('success', '[SIMULATION] Fraud spike injected', json.message);
        await fetchDashboard();
      }
    } catch {
      toast('error', 'Simulation failed', 'Network error');
    } finally {
      setSpiking(false);
    }
  }

  if (loading) return <PageLoader message="Loading dashboard…" />;
  if (error)   return <ErrorState message={error} onRetry={fetchDashboard} />;

  const stats = data?.stats;
  const noData = !stats || stats.totalTransactions === 0;

  // Build pie data
  const pieData = data
    ? Object.entries(data.riskDistribution)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value }))
    : [];

  const canAdmin  = user?.role === 'ADMIN';
  const canSpike  = ['ADMIN', 'RISK_ANALYST'].includes(user?.role ?? '');
  const trendData = data?.trendData ?? [];
  const recent    = data?.recentHighRisk ?? [];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">
            Welcome back{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''} 👋
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{user?.orgName}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canAdmin && noData && (
            <Button
              variant="primary"
              size="sm"
              loading={seeding}
              onClick={handleSeed}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Seed Demo Data
            </Button>
          )}
          {canSpike && !noData && (
            <Button
              variant="danger"
              size="sm"
              loading={spiking}
              onClick={handleSpike}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              }
            >
              Simulate Fraud Spike
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchDashboard}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            }
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Spike simulation banner */}
      {spiking && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-300 font-medium">
            [SIMULATION] Injecting high-risk transactions… dashboard will update shortly.
          </p>
        </div>
      )}

      {noData ? (
        <EmptyState
          title="No transaction data yet"
          description="Seed the synthetic dataset to see the dashboard come alive."
          action={
            canAdmin ? (
              <Button onClick={handleSeed} loading={seeding} size="md">
                Seed Demo Data
              </Button>
            ) : (
              <p className="text-xs text-slate-500">Ask your admin to seed data.</p>
            )
          }
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          }
        />
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="Total Transactions" value={stats!.totalTransactions.toLocaleString('en-IN')} />
            <StatCard
              label="High / Critical Risk"
              value={stats!.highRiskCount.toLocaleString('en-IN')}
              sub={`${stats!.criticalCount} critical`}
              accent="text-orange-400"
            />
            <StatCard
              label="Critical Cases"
              value={stats!.criticalCount.toLocaleString('en-IN')}
              accent="text-red-400"
            />
            <StatCard
              label="Active Investigations"
              value={stats!.activeInvestigations.toLocaleString('en-IN')}
              accent="text-blue-400"
            />
            <StatCard
              label="Pending Review"
              value={stats!.pendingReview.toLocaleString('en-IN')}
              accent={stats!.pendingReview > 0 ? 'text-amber-400' : 'text-slate-100'}
            />
            <StatCard
              label="Avg Risk Score"
              value={stats!.avgRiskScore}
              sub="across scored txns"
              accent={
                stats!.avgRiskScore > 60 ? 'text-orange-400' :
                stats!.avgRiskScore > 30 ? 'text-amber-400' : 'text-emerald-400'
              }
            />
          </div>

          {/* Charts row */}
          <div className="grid lg:grid-cols-3 gap-4">

            {/* Risk trend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Risk Trend — Last 30 Days</CardTitle>
                <span className="text-xs text-slate-500">Daily transaction volume & high-risk count</span>
              </CardHeader>
              {trendData.length === 0 ? (
                <EmptyState title="No trend data" description="Trend data populates as transactions are processed." />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      tickFormatter={v => v.slice(5)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone" dataKey="total" name="Total"
                      stroke="#3b82f6" strokeWidth={1.5} fill="url(#totalGrad)"
                    />
                    <Area
                      type="monotone" dataKey="high" name="High/Critical"
                      stroke="#ef4444" strokeWidth={1.5} fill="url(#highGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Risk distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Distribution</CardTitle>
              </CardHeader>
              {pieData.length === 0 ? (
                <EmptyState title="No data" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map(entry => (
                          <Cell key={entry.name} fill={DIST_COLORS[entry.name] ?? '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, name) => [`${Number(v).toLocaleString('en-IN')}`, String(name)]}
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1">
                    {pieData.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ background: DIST_COLORS[d.name] }}
                            aria-hidden="true"
                          />
                          <span className="text-slate-400">{d.name}</span>
                        </div>
                        <span className="text-slate-300 font-medium">{d.value.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Avg score trend bar chart */}
          {trendData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Avg Risk Score</CardTitle>
                <span className="text-xs text-slate-500">Colour indicates score level</span>
              </CardHeader>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={v => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="avgScore" name="Avg Score" radius={[2, 2, 0, 0]}>
                    {trendData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.avgScore > 60 ? '#f97316' :
                          entry.avgScore > 30 ? '#f59e0b' : '#10b981'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Recent high-risk transactions */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <CardTitle>Recent High-Risk Transactions</CardTitle>
              <Link href="/transactions?level=HIGH" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                View all →
              </Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState
                className="py-10"
                title="No high-risk transactions"
                description="High and critical risk transactions will appear here."
              />
            ) : (
              <div className="divide-y divide-slate-800">
                {recent.map((item, i) => {
                  const tx = item.transaction;
                  if (!tx) return null;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <RiskBadge level={item.level} score={item.score} />
                        <div className="min-w-0">
                          <p className="text-sm font-mono text-slate-300 truncate">{tx.external_tx_id}</p>
                          <p className="text-xs text-slate-500">
                            {tx.customer?.external_id ?? '—'} · {tx.payment_method} · {formatDateShort(tx.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <span className="text-sm font-semibold text-slate-200 hidden sm:block">
                          {formatCurrency(tx.amount)}
                        </span>
                        <Badge
                          variant={tx.payment_status === 'success' ? 'low' :
                                   tx.payment_status === 'disputed' ? 'critical' : 'default'}
                        >
                          {tx.payment_status}
                        </Badge>
                        <Link
                          href={`/transactions`}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors hidden sm:block"
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Quick action links */}
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              {
                href: '/transactions',
                label: 'Transaction Explorer',
                desc: 'Search, filter, and inspect all transactions',
                color: 'border-blue-500/20 hover:border-blue-500/40',
              },
              {
                href: '/review-queue',
                label: 'Review Queue',
                desc: `${stats!.pendingReview} case${stats!.pendingReview !== 1 ? 's' : ''} awaiting analyst decision`,
                color: 'border-amber-500/20 hover:border-amber-500/40',
              },
              {
                href: '/evaluation',
                label: 'Evaluation Lab',
                desc: 'Run precision/recall against held-out test set',
                color: 'border-emerald-500/20 hover:border-emerald-500/40',
              },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-xl border bg-slate-900/40 p-4 transition-colors ${link.color}`}
              >
                <p className="text-sm font-semibold text-slate-200 mb-0.5">{link.label}</p>
                <p className="text-xs text-slate-500">{link.desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
