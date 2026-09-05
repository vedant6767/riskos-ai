// ============================================================
// API: GET /api/cases/[id] — Full case detail
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) return NextResponse.json({ error: 'No org found' }, { status: 403 });

    const { data: riskCase, error } = await supabase
      .from('risk_cases')
      .select(`
        id, case_number, status, priority, created_at, updated_at, resolved_at, resolution,
        transaction:transactions(
          id, external_tx_id, amount, currency, payment_method, payment_status,
          hour_of_day, day_of_week, is_international, ip_country, dataset_split, created_at,
          customer:customers(external_id, account_age_days, avg_transaction_amount, total_transactions, risk_tier),
          device:devices(device_type, os, is_known_fraudulent, device_fingerprint)
        ),
        risk_score:risk_scores(id, score, level, model_version, calculated_at),
        investigation:investigations(
          id, status, started_at, completed_at,
          ai_decision:ai_decisions(
            id, risk_assessment, confidence_score, primary_reason,
            supporting_evidence, counter_evidence, recommended_action,
            reasoning_summary, uncertainty_notes, requires_human_review,
            engine_verdict, ai_verdict, verdicts_agree, model_used, created_at
          )
        ),
        review_queue:review_queue(
          id, status, priority, policy_action, analyst_decision, analyst_notes,
          decided_at, created_at,
          decider:users!review_queue_decided_by_fkey(full_name, email)
        )
      `)
      .eq('id', id)
      .eq('org_id', membership.org_id)
      .single();

    if (error || !riskCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Fetch risk signals separately (join depth limit workaround)
    const txId = ((Array.isArray(riskCase.transaction) ? riskCase.transaction[0] : riskCase.transaction) as { id: string } | null)?.id;
    let signals: unknown[] = [];
    if (txId) {
      const { data: sigs } = await supabase
        .from('risk_signals')
        .select('signal_type, signal_value, contribution, description')
        .eq('transaction_id', txId)
        .order('contribution', { ascending: false });
      signals = sigs ?? [];
    }

    // Fetch audit log for this case
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('id, event_type, action, actor_type, details, policy_result, outcome, created_at, actor:users(full_name, email)')
      .eq('entity_id', id)
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: true })
      .limit(50);

    return NextResponse.json({ case: riskCase, signals, auditLogs: auditLogs ?? [] });
  } catch (err) {
    console.error('[Cases/id] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
