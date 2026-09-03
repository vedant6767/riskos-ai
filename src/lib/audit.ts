// ============================================================
// RiskOS AI — Audit Log Writer
// Every meaningful event in the system is recorded here.
// This is server-side only (uses admin client to bypass RLS for writes)
// ============================================================

import { supabaseAdmin } from '@/lib/supabase/admin';

export type AuditEventType =
  | 'transaction.received'
  | 'risk.scored'
  | 'risk.case_created'
  | 'investigation.started'
  | 'investigation.completed'
  | 'investigation.failed'
  | 'ai.recommendation_generated'
  | 'policy.evaluated'
  | 'review.created'
  | 'review.assigned'
  | 'review.decision_made'
  | 'user.login'
  | 'user.logout'
  | 'user.registered'
  | 'fraud.spike_simulated'
  | 'evaluation.run_started'
  | 'evaluation.run_completed'
  | 'seed.data_created';

export interface AuditEvent {
  orgId: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'ai';
  eventType: AuditEventType;
  entityType?: string;
  entityId?: string;
  action: string;
  details?: Record<string, unknown>;
  policyResult?: string;
  outcome?: string;
}

export async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      org_id: event.orgId,
      actor_id: event.actorId ?? null,
      actor_type: event.actorType ?? 'system',
      event_type: event.eventType,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      action: event.action,
      details: event.details ?? {},
      policy_result: event.policyResult ?? null,
      outcome: event.outcome ?? null,
    });
  } catch (error) {
    // Audit failures should never crash the main flow — log but continue
    console.error('[Audit] Failed to write audit log:', error);
  }
}

export async function writeAuditLogs(events: AuditEvent[]): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert(
      events.map(event => ({
        org_id: event.orgId,
        actor_id: event.actorId ?? null,
        actor_type: event.actorType ?? 'system',
        event_type: event.eventType,
        entity_type: event.entityType ?? null,
        entity_id: event.entityId ?? null,
        action: event.action,
        details: event.details ?? {},
        policy_result: event.policyResult ?? null,
        outcome: event.outcome ?? null,
      }))
    );
  } catch (error) {
    console.error('[Audit] Failed to write audit logs batch:', error);
  }
}
