// ============================================================
// API: GET /api/evaluation/runs — Past evaluation runs
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
    if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 });
    if (!['ADMIN', 'RISK_ANALYST'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: runs, error } = await supabase
      .from('evaluation_runs')
      .select(`
        id, model_version, threshold, created_at,
        true_positives, false_positives, true_negatives, false_negatives,
        precision_score, recall_score, f1_score,
        false_positive_rate, false_negative_rate,
        false_positive_cost, false_negative_cost, fraud_caught_value,
        run_by
      `)
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    // Also return dataset summary
    const { data: datasets } = await supabase
      .from('datasets')
      .select('name, split, transaction_count, fraud_count, legitimate_count')
      .eq('org_id', membership.org_id);

    return NextResponse.json({ runs: runs ?? [], datasets: datasets ?? [] });
  } catch (err) {
    console.error('[Evaluation/Runs] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
