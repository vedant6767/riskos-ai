// ============================================================
// API: POST /api/simulate-spike
// Injects a burst of high-risk synthetic transactions.
// ADMIN + RISK_ANALYST only. Clearly labeled as simulation.
// ============================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateRiskScore } from '@/lib/risk-engine';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Spike batch size
const SPIKE_COUNT = 15;

// High-risk transaction profiles to inject
function buildSpikeTx(index: number, orgId: string, customerId: string, deviceId: string) {
  const now = new Date();
  const minutesAgo = index * 2; // spread over last 30 minutes
  const txTime = new Date(now.getTime() - minutesAgo * 60 * 1000);

  const amounts = [45000, 89000, 120000, 67000, 34000, 95000, 78000, 110000, 55000, 88000,
                   42000, 73000, 99000, 61000, 84000];
  const methods = ['card', 'card', 'upi', 'card', 'netbanking', 'card', 'wallet',
                   'card', 'card', 'upi', 'card', 'bnpl', 'card', 'card', 'upi'];

  return {
    org_id: orgId,
    external_tx_id: `SPIKE_${Date.now()}_${index}`,
    customer_id: customerId,
    device_id: deviceId,
    amount: amounts[index % amounts.length],
    currency: 'INR',
    payment_method: methods[index % methods.length],
    payment_status: index % 4 === 0 ? 'failed' : 'success',
    hour_of_day: 2 + (index % 3), // 2-4 AM
    day_of_week: txTime.getDay(),
    is_international: index % 5 === 0,
    ip_country: index % 5 === 0 ? 'US' : 'IN',
    is_fraud: true,
    dataset_split: 'live' as const,
    created_at: txTime.toISOString(),
    processed_at: now.toISOString(),
  };
}

export async function POST() {
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
      return NextResponse.json({ error: 'Insufficient permissions — ADMIN or RISK_ANALYST required' }, { status: 403 });
    }
    const orgId = membership.org_id;

    // Find a high-risk customer to attribute the spike to
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, avg_transaction_amount, total_transactions')
      .eq('org_id', orgId)
      .eq('risk_tier', 'high')
      .limit(1);

    const { data: devices } = await supabaseAdmin
      .from('devices')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_known_fraudulent', true)
      .limit(1);

    if (!customers?.length || !devices?.length) {
      return NextResponse.json({
        error: 'No seeded data found. Please run "Seed Data" from the dashboard first.'
      }, { status: 422 });
    }

    const customerId = customers[0].id;
    const deviceId = devices[0].id;
    const avgAmount = customers[0].avg_transaction_amount ?? 5000;
    const totalTx = customers[0].total_transactions ?? 10;

    const results = { inserted: 0, casesCreated: 0 };
    let caseCounter = await getCaseCount(orgId);

    for (let i = 0; i < SPIKE_COUNT; i++) {
      const txData = buildSpikeTx(i, orgId, customerId, deviceId);

      const { data: insertedTx } = await supabaseAdmin
        .from('transactions')
        .insert(txData)
        .select('id, amount')
        .single();

      if (!insertedTx) continue;
      results.inserted++;

      // Calculate risk score for spike transaction
      const engineResult = calculateRiskScore({
        amount: txData.amount,
        avgAmount,
        totalTransactions: totalTx,
        recentTxCount1h: 8 + i,  // artificially high velocity
        avgHourlyTx: 1,
        isNewDevice: false,
        isKnownFraudulentDevice: true,
        hourOfDay: txData.hour_of_day,
        isLateNight: true,
        isNewPaymentMethod: i % 3 === 0,
        isInternational: txData.is_international,
        failureRate: 0.4,
      });

      const { data: riskScore } = await supabaseAdmin
        .from('risk_scores')
        .insert({
          transaction_id: insertedTx.id,
          org_id: orgId,
          score: engineResult.score,
          level: engineResult.level,
          model_version: engineResult.modelVersion,
        })
        .select('id')
        .single();

      if (riskScore) {
        await supabaseAdmin.from('risk_signals').insert(
          engineResult.signals.map(s => ({
            transaction_id: insertedTx.id,
            org_id: orgId,
            signal_type: s.type,
            signal_value: s.value,
            contribution: s.contribution,
            description: s.description,
          }))
        );

        if (engineResult.level === 'HIGH' || engineResult.level === 'CRITICAL') {
          caseCounter++;
          const year = new Date().getFullYear();
          const caseNumber = `CASE-${year}-SPIKE-${String(caseCounter).padStart(3, '0')}`;

          const { data: riskCase } = await supabaseAdmin
            .from('risk_cases')
            .insert({
              org_id: orgId,
              transaction_id: insertedTx.id,
              risk_score_id: riskScore.id,
              case_number: caseNumber,
              status: 'open',
              priority: engineResult.level,
            })
            .select('id')
            .single();

          if (riskCase) {
            results.casesCreated++;
            await supabaseAdmin.from('review_queue').insert({
              org_id: orgId,
              case_id: riskCase.id,
              transaction_id: insertedTx.id,
              status: 'pending',
              priority: engineResult.level,
              policy_action: 'escalate',
            });
          }
        }
      }
    }

    await writeAuditLog({
      orgId,
      actorId: user.id,
      actorType: 'user',
      eventType: 'fraud.spike_simulated',
      action: `Fraud spike simulation injected ${results.inserted} transactions, created ${results.casesCreated} cases`,
      details: { ...results, simulatedBy: user.id, isSynthetic: true },
      outcome: 'simulation_complete',
    });

    return NextResponse.json({
      success: true,
      message: `[SIMULATION] Injected ${results.inserted} high-risk transactions, created ${results.casesCreated} cases in review queue.`,
      ...results,
    });
  } catch (err) {
    console.error('[SimulateSpike] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getCaseCount(orgId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('risk_cases')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);
  return count ?? 0;
}
