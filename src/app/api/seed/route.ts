// ============================================================
// API: POST /api/seed — Seeds synthetic data (ADMIN only)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateSyntheticDataset } from '@/lib/synthetic/generator';
import { calculateRiskScore } from '@/lib/risk-engine';
import { writeAuditLog } from '@/lib/audit';
import {
  checkIdempotency, startIdempotency,
  completeIdempotency, getIdempotencyKey,
} from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Idempotency — prevent duplicate seeding on retry
    const idempKey = getIdempotencyKey(request);
    if (idempKey) {
      const cached = checkIdempotency(`seed:${idempKey}`);
      if (cached.exists) {
        if (cached.processing) {
          return NextResponse.json({ error: 'Seed already in progress' }, { status: 409 });
        }
        return NextResponse.json(cached.result, {
          headers: { 'Idempotency-Replayed': 'true' },
        });
      }
      startIdempotency(`seed:${idempKey}`);
    }

    const orgId = membership.org_id;

    // Check if data already seeded
    const { count } = await supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId);

    if ((count ?? 0) > 100) {
      const already = { message: 'Data already seeded', count };
      if (idempKey) completeIdempotency(`seed:${idempKey}`, already);
      return NextResponse.json(already, { status: 200 });
    }

    console.log('[Seed] Generating synthetic dataset...');
    const { customers, devices, transactions } = generateSyntheticDataset(42);

    // Insert customers
    const customerRows = customers.map(c => ({
      org_id: orgId,
      external_id: c.external_id,
      account_age_days: c.account_age_days,
      total_transactions: c.total_transactions,
      total_amount: c.avg_transaction_amount * c.total_transactions,
      avg_transaction_amount: c.avg_transaction_amount,
      risk_tier: c.risk_profile,
    }));

    const { data: insertedCustomers, error: custError } = await supabaseAdmin
      .from('customers')
      .insert(customerRows)
      .select('id, external_id');

    if (custError) throw new Error(`Customer insert failed: ${custError.message}`);

    const customerMap = new Map(
      (insertedCustomers ?? []).map(c => [c.external_id, c.id])
    );

    // Insert devices
    const deviceRows = devices.map(d => ({
      org_id: orgId,
      device_fingerprint: d.device_fingerprint,
      device_type: d.device_type,
      os: d.os,
      is_known_fraudulent: d.is_known_fraudulent,
    }));

    const { data: insertedDevices, error: devError } = await supabaseAdmin
      .from('devices')
      .insert(deviceRows)
      .select('id, device_fingerprint');

    if (devError) throw new Error(`Device insert failed: ${devError.message}`);

    const deviceMap = new Map(
      (insertedDevices ?? []).map(d => [d.device_fingerprint, d.id])
    );

    // Insert transactions in batches + calculate risk scores
    const BATCH_SIZE = 100;
    let txInserted   = 0;
    let casesCreated = 0;
    let caseCounter  = 0;

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);

      const txRows = batch.map(tx => {
        const customer  = customers[tx.customer_index];
        const device    = devices[tx.device_index];
        const customerId = customerMap.get(customer.external_id);
        const deviceId   = deviceMap.get(device.device_fingerprint);

        return {
          org_id: orgId,
          external_tx_id: tx.external_tx_id,
          customer_id: customerId ?? null,
          device_id:   deviceId   ?? null,
          amount: tx.amount,
          currency: tx.currency,
          payment_method: tx.payment_method,
          payment_status: tx.payment_status,
          hour_of_day:    tx.hour_of_day,
          day_of_week:    tx.day_of_week,
          is_international: tx.is_international,
          ip_country: tx.ip_country,
          is_fraud:       tx.is_fraud,
          dataset_split:  tx.dataset_split,
          created_at:     tx.created_at.toISOString(),
          processed_at:   new Date().toISOString(),
        };
      });

      const { data: insertedTxs, error: txError } = await supabaseAdmin
        .from('transactions')
        .insert(txRows)
        .select('id, amount, is_fraud, dataset_split');

      if (txError) { console.error('[Seed] TX batch error:', txError.message); continue; }

      txInserted += insertedTxs?.length ?? 0;

      for (let j = 0; j < batch.length; j++) {
        const tx   = batch[j];
        const dbTx = insertedTxs?.[j];
        if (!dbTx) continue;

        const customer = customers[tx.customer_index];
        const device   = devices[tx.device_index];

        const engineResult = calculateRiskScore({
          amount:                   tx.amount,
          avgAmount:                customer.avg_transaction_amount,
          totalTransactions:        customer.total_transactions,
          recentTxCount1h:          tx.recent_tx_count_1h,
          avgHourlyTx:              1,
          isNewDevice:              tx.is_new_device,
          isKnownFraudulentDevice:  device.is_known_fraudulent,
          hourOfDay:                tx.hour_of_day,
          isLateNight:              tx.hour_of_day >= 0 && tx.hour_of_day <= 5,
          isNewPaymentMethod:       tx.is_new_payment_method,
          isInternational:          tx.is_international,
          failureRate:              tx.failure_rate,
        });

        const { data: riskScore } = await supabaseAdmin
          .from('risk_scores')
          .insert({
            transaction_id: dbTx.id,
            org_id:         orgId,
            score:          engineResult.score,
            level:          engineResult.level,
            model_version:  engineResult.modelVersion,
          })
          .select('id')
          .single();

        if (riskScore) {
          await supabaseAdmin.from('risk_signals').insert(
            engineResult.signals.map(s => ({
              transaction_id: dbTx.id,
              org_id:         orgId,
              signal_type:    s.type,
              signal_value:   s.value,
              contribution:   s.contribution,
              description:    s.description,
            }))
          );

          if (engineResult.level === 'HIGH' || engineResult.level === 'CRITICAL') {
            caseCounter++;
            const caseNumber = `CASE-${new Date().getFullYear()}-${String(caseCounter).padStart(4, '0')}`;

            const { data: riskCase } = await supabaseAdmin
              .from('risk_cases')
              .insert({
                org_id:        orgId,
                transaction_id: dbTx.id,
                risk_score_id:  riskScore.id,
                case_number:    caseNumber,
                status:   'open',
                priority: engineResult.level,
              })
              .select('id')
              .single();

            if (riskCase) {
              casesCreated++;
              await supabaseAdmin.from('review_queue').insert({
                org_id:         orgId,
                case_id:        riskCase.id,
                transaction_id: dbTx.id,
                status:         'pending',
                priority:       engineResult.level,
                policy_action:  engineResult.level === 'CRITICAL' ? 'escalate' : 'review',
              });
            }
          }
        }
      }
    }

    // Dataset records
    const { data: testTxs } = await supabaseAdmin
      .from('transactions')
      .select('is_fraud')
      .eq('org_id', orgId)
      .eq('dataset_split', 'test');

    const testFraudCount = testTxs?.filter(t => t.is_fraud).length ?? 0;

    await supabaseAdmin.from('datasets').insert([
      {
        org_id: orgId,
        name: 'Synthetic Dev Set',
        split: 'dev',
        transaction_count: 1400,
        fraud_count:      transactions.filter(t => t.dataset_split === 'dev' && t.is_fraud).length,
        legitimate_count: transactions.filter(t => t.dataset_split === 'dev' && !t.is_fraud).length,
      },
      {
        org_id: orgId,
        name: 'Held-Out Test Set',
        split: 'test',
        transaction_count: 600,
        fraud_count:      testFraudCount,
        legitimate_count: (testTxs?.length ?? 600) - testFraudCount,
      },
    ]);

    // Default policy
    await supabaseAdmin.from('risk_policies').insert({
      org_id: orgId, name: 'Default Policy', is_active: true,
      low_max: 30, medium_max: 60, high_max: 80,
      low_action: 'allow', medium_action: 'verify',
      high_action: 'review', critical_action: 'escalate',
      min_ai_confidence: 70, human_approval_threshold: 75,
    });

    await writeAuditLog({
      orgId, actorId: user.id, actorType: 'user',
      eventType: 'seed.data_created',
      action: 'Seeded synthetic dataset',
      details: { transactionsInserted: txInserted, casesCreated },
      outcome: 'success',
    });

    const result = {
      success: true,
      transactionsInserted: txInserted,
      casesCreated,
      message: `Seeded ${txInserted} transactions with ${casesCreated} risk cases`,
    };

    if (idempKey) completeIdempotency(`seed:${idempKey}`, result);
    return NextResponse.json(result);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Seed] Fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
