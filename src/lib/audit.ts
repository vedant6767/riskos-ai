// ============================================================
// RiskOS AI — Audit Log Writer
// Append-only — DB rules prevent UPDATE and DELETE.
// Server-side only (uses admin client to bypass RLS for writes).
// PII masking applied to details before storage.
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
  | 'ai.circuit_breaker_open'
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
  orgId:        string;
  actorId?:     string;
  actorType?:   'user' | 'system' | 'ai';
  eventType:    AuditEventType | string;
  entityType?:  string;
  entityId?:    string;
  action:       string;
  details?:     Record<string, unknown>;
  policyResult?: string;
  outcome?:     string;
}

// ── PII masking ────────────────────────────────────────────────────────────────
// Keys whose values should be masked in audit log details.
// UUIDs are safe to store (they are internal references, not PII).
// Email addresses, full names, IP addresses, and payment credentials are masked.

const PII_KEYS = new Set([
  'email', 'full_name', 'fullName', 'name',
  'ip_address', 'ipAddress', 'ip',
  'card_number', 'cardNumber', 'pan',
  'phone', 'mobile', 'address',
  'customer_email', 'customerEmail',
]);

function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const lk = key.toLowerCase();

  // Mask known PII fields
  if (PII_KEYS.has(key) || PII_KEYS.has(lk)) {
    if (value.length <= 4) return '****';
    return `****${value.slice(-4)}`;
  }

  // Mask email patterns anywhere
  if (value.includes('@') && value.includes('.')) {
    return value.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email-redacted]');
  }

  return value;
}

function maskDetails(details: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects (but not arrays — preserve structure)
      masked[key] = maskDetails(value as Record<string, unknown>);
    } else {
      masked[key] = maskValue(key, value);
    }
  }
  return masked;
}

// ── single event ───────────────────────────────────────────────────────────────
export async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    const safeDetails = maskDetails(event.details ?? {});

    await supabaseAdmin.from('audit_logs').insert({
      org_id:       event.orgId,
      actor_id:     event.actorId  ?? null,
      actor_type:   event.actorType ?? 'system',
      event_type:   event.eventType,
      entity_type:  event.entityType ?? null,
      entity_id:    event.entityId   ?? null,
      action:       event.action,
      details:      safeDetails,
      policy_result: event.policyResult ?? null,
      outcome:       event.outcome      ?? null,
    });
  } catch (error) {
    // Audit failures MUST NOT crash the main flow — log but continue
    console.error('[Audit] Failed to write audit log:', error);
  }
}

// ── batch ──────────────────────────────────────────────────────────────────────
export async function writeAuditLogs(events: AuditEvent[]): Promise<void> {
  try {
    const rows = events.map(event => ({
      org_id:       event.orgId,
      actor_id:     event.actorId  ?? null,
      actor_type:   event.actorType ?? 'system',
      event_type:   event.eventType,
      entity_type:  event.entityType ?? null,
      entity_id:    event.entityId   ?? null,
      action:       event.action,
      details:      maskDetails(event.details ?? {}),
      policy_result: event.policyResult ?? null,
      outcome:       event.outcome      ?? null,
    }));
    await supabaseAdmin.from('audit_logs').insert(rows);
  } catch (error) {
    console.error('[Audit] Failed to write audit logs batch:', error);
  }
}
