// ============================================================
// RiskOS AI — Core TypeScript Types
// ============================================================

export type UserRole = 'ADMIN' | 'RISK_ANALYST' | 'MERCHANT' | 'VIEWER';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PolicyAction = 'allow' | 'verify' | 'review' | 'escalate';
export type DatasetSplit = 'dev' | 'test' | 'live';
export type PaymentMethod = 'card' | 'upi' | 'netbanking' | 'wallet' | 'emi' | 'bnpl';
export type PaymentStatus = 'success' | 'failed' | 'pending' | 'refunded' | 'disputed';
export type CaseStatus = 'open' | 'investigating' | 'pending_review' | 'resolved' | 'escalated' | 'closed';
export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'escalated' | 'legitimate';
export type InvestigationStatus = 'pending' | 'running' | 'completed' | 'failed';
export type AIRecommendedAction = 'allow' | 'verify' | 'review' | 'escalate' | 'block';

// ---- Database Row Types ----

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'demo' | 'starter' | 'pro' | 'enterprise';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  user?: User;
  organization?: Organization;
}

export interface Customer {
  id: string;
  org_id: string;
  external_id: string;
  email_hash: string | null;
  account_age_days: number | null;
  total_transactions: number;
  total_amount: number;
  avg_transaction_amount: number | null;
  risk_tier: string;
  created_at: string;
}

export interface Device {
  id: string;
  org_id: string;
  device_fingerprint: string;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  is_known_fraudulent: boolean;
  first_seen_at: string;
  last_seen_at: string;
}

export interface Transaction {
  id: string;
  org_id: string;
  external_tx_id: string;
  customer_id: string | null;
  device_id: string | null;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  hour_of_day: number | null;
  day_of_week: number | null;
  is_international: boolean;
  ip_country: string | null;
  is_fraud: boolean | null;
  dataset_split: DatasetSplit | null;
  created_at: string;
  processed_at: string | null;
  // Joined fields
  customer?: Customer;
  device?: Device;
  risk_score?: RiskScore;
  risk_signals?: RiskSignal[];
}

export interface RiskScore {
  id: string;
  transaction_id: string;
  org_id: string;
  score: number;
  level: RiskLevel;
  model_version: string;
  calculated_at: string;
}

export interface RiskSignal {
  id: string;
  transaction_id: string;
  org_id: string;
  signal_type: string;
  signal_value: number | null;
  contribution: number;
  description: string | null;
  created_at: string;
}

export interface RiskCase {
  id: string;
  org_id: string;
  transaction_id: string;
  risk_score_id: string | null;
  case_number: string;
  status: CaseStatus;
  priority: RiskLevel;
  assigned_to: string | null;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  transaction?: Transaction;
  risk_score?: RiskScore;
  investigation?: Investigation;
  review_queue?: ReviewQueueItem;
}

export interface Investigation {
  id: string;
  org_id: string;
  case_id: string;
  transaction_id: string;
  initiated_by: string | null;
  status: InvestigationStatus;
  started_at: string;
  completed_at: string | null;
  // Joined
  ai_decision?: AIDecision;
  case?: RiskCase;
}

export interface AIDecision {
  id: string;
  investigation_id: string;
  org_id: string;
  risk_assessment: RiskLevel;
  confidence_score: number;
  primary_reason: string;
  supporting_evidence: string[];
  counter_evidence: string[];
  recommended_action: AIRecommendedAction;
  reasoning_summary: string;
  uncertainty_notes: string | null;
  requires_human_review: boolean;
  model_used: string;
  prompt_tokens: number | null;
  response_tokens: number | null;
  engine_verdict: RiskLevel;
  ai_verdict: RiskLevel;
  verdicts_agree: boolean | null;
  created_at: string;
}

export interface RiskPolicy {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  low_max: number;
  medium_max: number;
  high_max: number;
  low_action: PolicyAction;
  medium_action: PolicyAction;
  high_action: PolicyAction;
  critical_action: PolicyAction;
  min_ai_confidence: number;
  human_approval_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewQueueItem {
  id: string;
  org_id: string;
  case_id: string;
  transaction_id: string;
  investigation_id: string | null;
  assigned_to: string | null;
  status: ReviewStatus;
  priority: RiskLevel;
  policy_action: string | null;
  analyst_decision: 'approve' | 'mark_legitimate' | 'escalate' | 'mark_suspicious' | null;
  analyst_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  transaction?: Transaction;
  case?: RiskCase;
  investigation?: Investigation;
  ai_decision?: AIDecision;
}

export interface AuditLog {
  id: string;
  org_id: string;
  actor_id: string | null;
  actor_type: 'user' | 'system' | 'ai';
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  details: Record<string, unknown>;
  policy_result: string | null;
  outcome: string | null;
  ip_address: string | null;
  created_at: string;
  actor?: User;
}

export interface Dataset {
  id: string;
  org_id: string;
  name: string;
  split: 'dev' | 'test';
  transaction_count: number | null;
  fraud_count: number | null;
  legitimate_count: number | null;
  created_at: string;
}

export interface EvaluationRun {
  id: string;
  org_id: string;
  dataset_id: string | null;
  model_version: string;
  threshold: number;
  true_positives: number | null;
  false_positives: number | null;
  true_negatives: number | null;
  false_negatives: number | null;
  precision_score: number | null;
  recall_score: number | null;
  f1_score: number | null;
  false_positive_rate: number | null;
  false_negative_rate: number | null;
  avg_tx_amount: number | null;
  false_positive_cost: number | null;
  false_negative_cost: number | null;
  fraud_caught_value: number | null;
  run_by: string | null;
  created_at: string;
}

// ---- API / Engine Types ----

export interface SignalResult {
  type: string;
  value: number;
  contribution: number;
  description: string;
}

export interface RiskEngineResult {
  score: number;
  level: RiskLevel;
  signals: SignalResult[];
  modelVersion: string;
}

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
  policyName: string;
  requiresHuman: boolean;
  aiOverrideApplied: boolean;
}

export interface CounterfactualStep {
  signalType: string;
  description: string;
  currentContribution: number;
  scoreWithout: number;
  scoreReduction: number;
  levelWithout: RiskLevel;
}

export interface CounterfactualResult {
  originalScore: number;
  originalLevel: RiskLevel;
  steps: CounterfactualStep[];
  disclaimer: string;
}

export interface EvaluationMetrics {
  threshold: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  avgTxAmount: number;
  falsePositiveCost: number;
  falseNegativeCost: number;
  fraudCaughtValue: number;
  totalTransactions: number;
  fraudTransactions: number;
}

export interface DashboardStats {
  totalTransactions: number;
  highRiskCount: number;
  criticalCount: number;
  activeInvestigations: number;
  pendingReview: number;
  avgRiskScore: number;
  fraudSpike: boolean;
}

// ---- Auth Types ----

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  orgId: string;
  orgName: string;
  fullName: string | null;
}
