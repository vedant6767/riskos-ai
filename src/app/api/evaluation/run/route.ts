// ============================================================
// API: POST /api/evaluation/run
// Runs metrics against the held-out TEST set.
// Threshold parameter controls what score is "flagged".
// No LLM — pure deterministic math.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateMetricsAtMultipleThresholds, type PredictionRecord } from '@/lib/evaluation/metrics';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  threshold: z.number().int().min(1).max(99).default(60),
});

export async function POST(request: NextRequest) {
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
    if (!['ADMIN', 'RISK_ANALYST'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const orgId = membership.org_id;

    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    const threshold = parsed.success ? parsed.data.threshold : 60;

    await writeAuditLog({
      orgId, actorId: user.id, actorType: 'user',
      eventType: 'evaluation.run_started',
      action: `Evaluation run started at threshold ${threshold}`,
      details: { threshold },
    });

    // Load the held-out TEST set transactions with their labels and risk scores
    // IMPORTANT: we never use these records during model development
    const { data: testRecords, error } = await supabase
      .from('transactions')
      .select('id, amount, is_fraud, risk_scores(score)')
      .eq('org_id', orgId)
      .eq('dataset_split', 'test')
      .not('is_fraud', 'is', null);

    if (error) throw new Error(error.message);
    if (!testRecords || testRecords.length === 0) {
      return NextResponse.json({ error: 'No test records found. Please seed data first.' }, { status: 422 });
    }

    // Build prediction records
    const predictions: PredictionRecord[] = testRecords
      .filter(r => {
        const rs = (Array.isArray(r.risk_scores) ? r.risk_scores[0] : r.risk_scores) as { score: number } | null;
        return rs !== null;
      })
      .map(r => {
        const rs = (Array.isArray(r.risk_scores) ? r.risk_scores[0] : r.risk_scores) as { score: number };
        return {
          transactionId: r.id,
          actualFraud: r.is_fraud as boolean,
          predictedScore: rs.score,
          amount: r.amount,
        };
      });

    if (predictions.length === 0) {
      return NextResponse.json({ error: 'Test set exists but has no risk scores yet.' }, { status: 422 });
    }

    // Calculate at the requested threshold + comparison set
    const thresholds = [20, 30, 40, 50, 60, 70, 80];
    if (!thresholds.includes(threshold)) thresholds.push(threshold);
    thresholds.sort((a, b) => a - b);

    const allMetrics = calculateMetricsAtMultipleThresholds(predictions, thresholds);
    const primaryMetrics = allMetrics.find(m => m.threshold === threshold)!;

    // Persist the primary run to evaluation_runs
    const { data: runRow } = await supabaseAdmin
      .from('evaluation_runs')
      .insert({
        org_id: orgId,
        model_version: 'v1.0',
        threshold,
        true_positives:    primaryMetrics.truePositives,
        false_positives:   primaryMetrics.falsePositives,
        true_negatives:    primaryMetrics.trueNegatives,
        false_negatives:   primaryMetrics.falseNegatives,
        precision_score:   primaryMetrics.precision,
        recall_score:      primaryMetrics.recall,
        f1_score:          primaryMetrics.f1,
        false_positive_rate: primaryMetrics.falsePositiveRate,
        false_negative_rate: primaryMetrics.falseNegativeRate,
        avg_tx_amount:     primaryMetrics.avgTxAmount,
        false_positive_cost: primaryMetrics.falsePositiveCost,
        false_negative_cost: primaryMetrics.falseNegativeCost,
        fraud_caught_value:  primaryMetrics.fraudCaughtValue,
        run_by: user.id,
      })
      .select('id')
      .single();

    await writeAuditLog({
      orgId, actorId: user.id, actorType: 'user',
      eventType: 'evaluation.run_completed',
      action: `Evaluation completed: precision=${primaryMetrics.precision.toFixed(3)}, recall=${primaryMetrics.recall.toFixed(3)}, F1=${primaryMetrics.f1.toFixed(3)}`,
      details: { runId: runRow?.id, threshold, sampleSize: predictions.length },
      outcome: 'success',
    });

    return NextResponse.json({
      runId: runRow?.id,
      threshold,
      primary: primaryMetrics,
      curve: allMetrics,
      sampleSize: predictions.length,
      testSetSize: testRecords.length,
    });
  } catch (err) {
    console.error('[Evaluation/Run] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
