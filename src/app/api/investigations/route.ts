// ============================================================
// API: POST /api/investigations — Start AI investigation for a case
// Only ADMIN and RISK_ANALYST can investigate
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runAIInvestigation } from '@/lib/ai/investigator';
import { evaluatePolicy } from '@/lib/risk-engine';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';
import type { RiskPolicy, RiskLevel } from '@/types';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ caseId: z.string().uuid() });

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

    // Role gate — ADMIN and RISK_ANALYST only
    if (!['ADMIN', 'RISK_ANALYST'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const orgId = membership.org_id;

    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    const { caseId } = parsed.data;

    // Load case with full context — RLS ensures org isolation
    const { data: riskCase, error: caseError } = await supabase
      .from('risk_cases')
      .select(`
        id, case_number, priority, status,
        transaction:transactions(
          id, external_tx_id, amount, payment_method, payment_status,
          hour_of_day, is_international, ip_country,
          customer:customers(external_id, avg_transaction_amount, total_transactions, account_age_days)
        ),
        risk_score:risk_scores(id, score, level)
      `)
      .eq('id', caseId)
      .eq('org_id', orgId)
      .single();

    if (caseError || !riskCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Check for existing completed investigation
    const { data: existingInv } = await supabase
      .from('investigations')
      .select('id, status')
      .eq('case_id', caseId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (existingInv?.status === 'completed') {
      return NextResponse.json({ error: 'Investigation already completed for this case' }, { status: 409 });
    }

    const tx = (Array.isArray(riskCase.transaction) ? riskCase.transaction[0] : riskCase.transaction) as Record<string, unknown> | null;
    const rs = (Array.isArray(riskCase.risk_score) ? riskCase.risk_score[0] : riskCase.risk_score) as { id: string; score: number; level: string } | null;
    const customer = tx?.customer as Record<string, unknown> | null;

    if (!tx || !rs) {
      return NextResponse.json({ error: 'Case has no transaction or risk score data' }, { status: 422 });
    }

    // Create investigation record (status: running)
    const invId = existingInv?.id;
    let investigationId: string;

    if (invId) {
      await supabaseAdmin
        .from('investigations')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', invId);
      investigationId = invId;
    } else {
      const { data: newInv, error: invErr } = await supabaseAdmin
        .from('investigations')
        .insert({
          org_id: orgId,
          case_id: caseId,
          transaction_id: tx.id as string,
          initiated_by: user.id,
          status: 'running',
        })
        .select('id')
        .single();
      if (invErr || !newInv) throw new Error('Failed to create investigation record');
      investigationId = newInv.id;
    }

    // Update case status
    await supabaseAdmin
      .from('risk_cases')
      .update({ status: 'investigating' })
      .eq('id', caseId);

    await writeAuditLog({
      orgId,
      actorId: user.id,
      actorType: 'user',
      eventType: 'investigation.started',
      entityType: 'risk_case',
      entityId: caseId,
      action: `Investigation started by analyst`,
      details: { caseNumber: riskCase.case_number, investigationId },
    });

    // Load risk signals
    const { data: signals } = await supabase
      .from('risk_signals')
      .select('id, signal_type, contribution, description, signal_value')
      .eq('transaction_id', tx.id as string)
      .eq('org_id', orgId);

    // Run AI investigation
    const aiResult = await runAIInvestigation({
      transaction: {
        external_tx_id: tx.external_tx_id as string,
        amount: tx.amount as number,
        payment_method: tx.payment_method as never,
        payment_status: tx.payment_status as never,
        hour_of_day: tx.hour_of_day as number | null,
        is_international: tx.is_international as boolean,
        ip_country: tx.ip_country as string | null,
      },
      signals: (signals ?? []).map(s => ({
        id: s.id,
        signal_type: s.signal_type,
        contribution: s.contribution,
        description: s.description,
        signal_value: s.signal_value,
        transaction_id: tx.id as string,
        org_id: orgId,
        created_at: new Date().toISOString(),
      })),
      engineScore: rs.score,
      engineLevel: rs.level as RiskLevel,
      customerHistory: {
        avgAmount: (customer?.avg_transaction_amount as number) ?? 0,
        totalTransactions: (customer?.total_transactions as number) ?? 0,
        accountAgeDays: (customer?.account_age_days as number) ?? 0,
      },
    });

    // Load active policy for org
    const { data: policyRow } = await supabaseAdmin
      .from('risk_policies')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const policy = policyRow as RiskPolicy | null;

    let aiDecisionId: string | null = null;

    if (aiResult.success && aiResult.data) {
      const d = aiResult.data;
      const { data: aiDec } = await supabaseAdmin
        .from('ai_decisions')
        .insert({
          investigation_id: investigationId,
          org_id: orgId,
          risk_assessment:     d.risk_assessment,
          confidence_score:    d.confidence_score,
          primary_reason:      d.primary_reason,
          supporting_evidence: d.supporting_evidence,
          counter_evidence:    d.counter_evidence,
          recommended_action:  d.recommended_action,
          reasoning_summary:   d.reasoning_summary,
          uncertainty_notes:   d.uncertainty_notes ?? null,
          requires_human_review: d.requires_human_review,
          model_used:          d.model_used,
          prompt_tokens:       d.prompt_tokens ?? null,
          response_tokens:     d.response_tokens ?? null,
          engine_verdict:      d.engine_verdict,
          ai_verdict:          d.ai_verdict,
          verdicts_agree:      d.verdicts_agree,
        })
        .select('id')
        .single();
      aiDecisionId = aiDec?.id ?? null;

      await writeAuditLog({
        orgId,
        actorId: undefined,
        actorType: 'ai',
        eventType: 'ai.recommendation_generated',
        entityType: 'risk_case',
        entityId: caseId,
        action: `AI generated risk assessment: ${d.risk_assessment} (confidence: ${d.confidence_score}%)`,
        details: {
          engineVerdict: d.engine_verdict,
          aiVerdict: d.ai_verdict,
          verdictsAgree: d.verdicts_agree,
          recommendedAction: d.recommended_action,
        },
      });
    } else {
      await writeAuditLog({
        orgId,
        actorId: undefined,
        actorType: 'system',
        eventType: aiResult.breakerOpen ? 'ai.circuit_breaker_open' : 'investigation.failed',
        entityType: 'risk_case',
        entityId: caseId,
        action: aiResult.breakerOpen
          ? `AI circuit breaker open — engine-only verdict used`
          : `AI investigation failed — falling back to engine verdict`,
        details: { error: aiResult.error, fallback: true, breakerOpen: aiResult.breakerOpen ?? false },
      });
    }

    // Mark investigation complete
    await supabaseAdmin
      .from('investigations')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', investigationId);

    // Run policy evaluation
    let policyResult = null;
    if (policy) {
      const aiConf = aiResult.data?.confidence_score;
      policyResult = evaluatePolicy(rs.score, rs.level as RiskLevel, policy, aiConf);

      await writeAuditLog({
        orgId,
        actorId: undefined,
        actorType: 'system',
        eventType: 'policy.evaluated',
        entityType: 'risk_case',
        entityId: caseId,
        action: `Policy evaluated: ${policyResult.action}`,
        details: { policyName: policyResult.policyName, reason: policyResult.reason },
        policyResult: policyResult.action,
        outcome: policyResult.requiresHuman ? 'human_review_required' : 'automated',
      });

      // Ensure review queue item exists for cases requiring human review
      if (policyResult.requiresHuman) {
        const { data: existingQ } = await supabaseAdmin
          .from('review_queue')
          .select('id')
          .eq('case_id', caseId)
          .maybeSingle();

        if (!existingQ) {
          await supabaseAdmin.from('review_queue').insert({
            org_id: orgId,
            case_id: caseId,
            transaction_id: tx.id as string,
            investigation_id: investigationId,
            status: 'pending',
            priority: riskCase.priority,
            policy_action: policyResult.action,
          });
        } else {
          await supabaseAdmin
            .from('review_queue')
            .update({ investigation_id: investigationId, policy_action: policyResult.action })
            .eq('id', existingQ.id);
        }
      }

      await supabaseAdmin
        .from('risk_cases')
        .update({ status: policyResult.requiresHuman ? 'pending_review' : 'open' })
        .eq('id', caseId);
    }

    await writeAuditLog({
      orgId,
      actorId: undefined,
      actorType: 'system',
      eventType: 'investigation.completed',
      entityType: 'risk_case',
      entityId: caseId,
      action: 'Investigation completed',
      details: { investigationId, aiSuccess: aiResult.success },
      outcome: 'completed',
    });

    return NextResponse.json({
      success: true,
      investigationId,
      aiDecisionId,
      policyResult,
      aiFailed: !aiResult.success,
      aiError: aiResult.error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Investigations] Error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
