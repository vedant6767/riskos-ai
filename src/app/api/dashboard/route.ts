// ============================================================
// API: GET /api/dashboard — Dashboard stats (real data)
// ============================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) return NextResponse.json({ error: 'No org found' }, { status: 403 });
    const orgId = membership.org_id;

    // Total transactions
    const { count: totalTxs } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId);

    // High-risk count (score > 60)
    const { count: highRiskCount } = await supabase
      .from('risk_scores')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('level', ['HIGH', 'CRITICAL']);

    // Critical count
    const { count: criticalCount } = await supabase
      .from('risk_scores')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('level', 'CRITICAL');

    // Active investigations
    const { count: activeInvestigations } = await supabase
      .from('investigations')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['pending', 'running']);

    // Pending review
    const { count: pendingReview } = await supabase
      .from('review_queue')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending');

    // Average risk score
    const { data: avgData } = await supabase
      .from('risk_scores')
      .select('score')
      .eq('org_id', orgId)
      .limit(1000);

    const avgScore = avgData && avgData.length > 0
      ? avgData.reduce((sum, r) => sum + r.score, 0) / avgData.length
      : 0;

    // Risk trend: last 30 days by day
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentTxs } = await supabase
      .from('transactions')
      .select('created_at, risk_scores(score, level)')
      .eq('org_id', orgId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })
      .limit(500);

    // Build daily aggregates
    const dailyMap = new Map<string, { date: string; total: number; high: number; avgScore: number; scores: number[] }>();

    for (const tx of recentTxs ?? []) {
      const date = tx.created_at.split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { date, total: 0, high: 0, avgScore: 0, scores: [] });
      }
      const day = dailyMap.get(date)!;
      day.total++;
      const score = ((Array.isArray(tx.risk_scores) ? tx.risk_scores[0] : tx.risk_scores) as { score: number; level: string } | null);
      if (score) {
        day.scores.push(score.score);
        if (score.level === 'HIGH' || score.level === 'CRITICAL') day.high++;
      }
    }

    const trendData = Array.from(dailyMap.values()).map(d => ({
      date: d.date,
      total: d.total,
      high: d.high,
      avgScore: d.scores.length > 0 ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length) : 0,
    }));

    // Risk distribution
    const { data: scoreDistribution } = await supabase
      .from('risk_scores')
      .select('level')
      .eq('org_id', orgId);

    const dist = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const r of scoreDistribution ?? []) {
      if (r.level in dist) dist[r.level as keyof typeof dist]++;
    }

    // Recent high-risk transactions
    const { data: recentHighRisk } = await supabase
      .from('risk_scores')
      .select(`
        score, level, calculated_at,
        transaction:transactions(id, external_tx_id, amount, currency, payment_method, payment_status, created_at,
          customer:customers(external_id))
      `)
      .eq('org_id', orgId)
      .in('level', ['HIGH', 'CRITICAL'])
      .order('calculated_at', { ascending: false })
      .limit(8);

    return NextResponse.json({
      stats: {
        totalTransactions: totalTxs ?? 0,
        highRiskCount: highRiskCount ?? 0,
        criticalCount: criticalCount ?? 0,
        activeInvestigations: activeInvestigations ?? 0,
        pendingReview: pendingReview ?? 0,
        avgRiskScore: Math.round(avgScore),
      },
      trendData,
      riskDistribution: dist,
      recentHighRisk: recentHighRisk ?? [],
    });
  } catch (error) {
    console.error('[Dashboard] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
