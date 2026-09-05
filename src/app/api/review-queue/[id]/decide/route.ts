// ============================================================
// API: POST /api/review-queue/[id]/decide — Analyst decision
// Allowed: ADMIN, RISK_ANALYST
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const DecideSchema = z.object({
  decision: z.enum(['approve', 'mark_legitimate', 'escalate', 'mark_suspicious']),
  notes: z.string().max(1000).optional(),
});

const DECISION_STATUS_MAP = {
  approve:          'approved',
  mark_legitimate:  'legitimate',
  escalate:         'escalated',
  mark_suspicious:  'rejected',
} as const;

const CASE_STATUS_MAP = {
  approve:          'resolved',
  mark_legitimate:  'resolved',
  escalate:         'escalated',
  mark_suspicious:  'resolved',
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const body = await request.json().catch(() => null);
    const parsed = DecideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { decision, notes } = parsed.data;

    // Load review queue item — RLS enforces org isolation
    const { data: queueItem, error: qErr } = await supabase
      .from('review_queue')
      .select('id, case_id, transaction_id, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (qErr || !queueItem) {
      return NextResponse.json({ error: 'Review item not found' }, { status: 404 });
    }

    if (['approved', 'rejected', 'legitimate'].includes(queueItem.status)) {
      return NextResponse.json({ error: 'This case has already been decided' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const newStatus = DECISION_STATUS_MAP[decision];
    const newCaseStatus = CASE_STATUS_MAP[decision];

    // Update review queue
    await supabaseAdmin
      .from('review_queue')
      .update({
        status: newStatus,
        analyst_decision: decision,
        analyst_notes: notes ?? null,
        decided_by: user.id,
        decided_at: now,
        updated_at: now,
      })
      .eq('id', id);

    // Update case status
    await supabaseAdmin
      .from('risk_cases')
      .update({
        status: newCaseStatus,
        resolved_at: newCaseStatus === 'resolved' ? now : null,
        resolution: decision,
        updated_at: now,
      })
      .eq('id', queueItem.case_id);

    await writeAuditLog({
      orgId,
      actorId: user.id,
      actorType: 'user',
      eventType: 'review.decision_made',
      entityType: 'risk_case',
      entityId: queueItem.case_id,
      action: `Analyst decision: ${decision}`,
      details: {
        reviewQueueId: id,
        decision,
        notes: notes ?? null,
        transactionId: queueItem.transaction_id,
      },
      outcome: decision,
    });

    return NextResponse.json({ success: true, decision, queueStatus: newStatus });
  } catch (err) {
    console.error('[Review/Decide] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
