// ============================================================
// API: GET /api/dashboard/heatmap
// Returns 7×24 grid of high-risk transaction counts (last 30 days)
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
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get HIGH+CRITICAL risk scores in last 30 days, join to transactions for hour+day
    const { data, error } = await supabase
      .from('risk_scores')
      .select(`
        level,
        transaction:transactions!inner(
          hour_of_day,
          day_of_week,
          created_at
        )
      `)
      .eq('org_id', membership.org_id)
      .in('level', ['HIGH', 'CRITICAL'])
      .gte('calculated_at', since);

    if (error) throw new Error(error.message);

    // Aggregate into 7×24 buckets
    const buckets = new Map<string, number>();
    for (const row of data ?? []) {
      const tx = Array.isArray(row.transaction) ? row.transaction[0] : row.transaction;
      if (!tx || tx.hour_of_day === null || tx.day_of_week === null) continue;
      const key = `${tx.day_of_week}:${tx.hour_of_day}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const heatmap = Array.from(buckets.entries()).map(([key, count]) => {
      const [day, hour] = key.split(':').map(Number);
      return { day_of_week: day, hour_of_day: hour, count };
    });

    return NextResponse.json({ heatmap });
  } catch (err) {
    console.error('[Heatmap] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
