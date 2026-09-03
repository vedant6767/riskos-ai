// ============================================================
// RiskOS AI — Deterministic Risk Engine
// Signals + Scoring + Policy (NO LLM in this path)
// ============================================================

import type { Transaction, RiskSignal, SignalResult, RiskEngineResult, RiskLevel, RiskPolicy, PolicyAction, PolicyDecision } from '@/types';

export const MODEL_VERSION = 'v1.0';

// ---- Signal Calculators ----

/**
 * Amount Deviation Signal
 * Calculates how many standard deviations this transaction's amount
 * is from the customer's historical average.
 * Max contribution: 25 pts
 */
export function calcAmountDeviation(
  amount: number,
  avgAmount: number | null,
  totalTransactions: number
): SignalResult {
  if (!avgAmount || totalTransactions < 3) {
    return {
      type: 'amount_deviation',
      value: 0,
      contribution: 5, // slight risk for unknown history
      description: 'Insufficient transaction history to establish baseline',
    };
  }

  // Use a simplified z-score approximation (stddev ≈ avg * 0.5 for payments)
  const estimatedStdDev = avgAmount * 0.5;
  const zScore = Math.abs(amount - avgAmount) / Math.max(estimatedStdDev, 1);

  let contribution = 0;
  if (zScore < 1.0) contribution = 0;
  else if (zScore < 1.5) contribution = 5;
  else if (zScore < 2.0) contribution = 10;
  else if (zScore < 2.5) contribution = 16;
  else if (zScore < 3.0) contribution = 20;
  else contribution = 25;

  return {
    type: 'amount_deviation',
    value: parseFloat(zScore.toFixed(2)),
    contribution,
    description: zScore >= 2
      ? `Amount is ${zScore.toFixed(1)}σ above customer average (avg: ₹${Math.round(avgAmount).toLocaleString('en-IN')})`
      : `Amount within normal range for this customer`,
  };
}

/**
 * Velocity Anomaly Signal
 * Detects unusually high transaction frequency in a short window.
 * Requires recent_tx_count_1h (transactions in last 1 hour).
 * Max contribution: 25 pts
 */
export function calcVelocityAnomaly(
  recentTxCount1h: number,
  avgHourlyTx: number
): SignalResult {
  if (avgHourlyTx === 0) avgHourlyTx = 1;
  const ratio = recentTxCount1h / avgHourlyTx;

  let contribution = 0;
  if (ratio < 2) contribution = 0;
  else if (ratio < 3) contribution = 8;
  else if (ratio < 5) contribution = 15;
  else if (ratio < 8) contribution = 20;
  else contribution = 25;

  return {
    type: 'velocity_anomaly',
    value: recentTxCount1h,
    contribution,
    description: recentTxCount1h >= 3
      ? `${recentTxCount1h} transactions in last hour (${ratio.toFixed(1)}× normal rate)`
      : `Normal transaction frequency`,
  };
}

/**
 * Device Change Signal
 * Flags when a customer is using a new/unknown device.
 * Max contribution: 20 pts
 */
export function calcDeviceChange(
  isNewDevice: boolean,
  isKnownFraudulentDevice: boolean
): SignalResult {
  let contribution = 0;
  let description = 'Known device — no anomaly';

  if (isKnownFraudulentDevice) {
    contribution = 20;
    description = 'Device flagged as associated with fraudulent activity';
  } else if (isNewDevice) {
    contribution = 15;
    description = 'New device not previously seen for this customer';
  }

  return {
    type: 'device_change',
    value: isNewDevice ? 1 : 0,
    contribution,
    description,
  };
}

/**
 * Time-of-Day Anomaly Signal
 * Flags transactions at unusual hours for this customer.
 * Max contribution: 15 pts
 */
export function calcTimeOfDayAnomaly(
  hourOfDay: number | null,
  isLateNight: boolean // 0-5 AM
): SignalResult {
  if (hourOfDay === null) {
    return { type: 'time_anomaly', value: 0, contribution: 0, description: 'Timestamp not available' };
  }

  let contribution = 0;
  let description = 'Transaction at normal business hours';

  if (hourOfDay >= 0 && hourOfDay <= 4) {
    contribution = 15;
    description = `Transaction at ${hourOfDay}:00 AM — unusual late-night activity`;
  } else if (hourOfDay >= 1 && hourOfDay <= 5) {
    contribution = 12;
    description = `Transaction at ${hourOfDay}:00 AM — late-night activity`;
  } else if (isLateNight) {
    contribution = 8;
    description = 'Transaction outside normal hours for this customer';
  }

  return {
    type: 'time_anomaly',
    value: hourOfDay,
    contribution,
    description,
  };
}

/**
 * Behavioral Deviation Signal
 * Detects changes in payment method or behavioral patterns.
 * Max contribution: 15 pts
 */
export function calcBehavioralDeviation(
  isNewPaymentMethod: boolean,
  isInternational: boolean,
  failureRate: number // 0–1
): SignalResult {
  let contribution = 0;
  const reasons: string[] = [];

  if (isInternational) {
    contribution += 8;
    reasons.push('International transaction');
  }
  if (isNewPaymentMethod) {
    contribution += 4;
    reasons.push('New payment method not seen before');
  }
  if (failureRate > 0.3) {
    contribution += 3;
    reasons.push(`High recent failure rate (${Math.round(failureRate * 100)}%)`);
  }

  contribution = Math.min(contribution, 15);

  return {
    type: 'behavioral_deviation',
    value: parseFloat(failureRate.toFixed(2)),
    contribution,
    description: reasons.length > 0 ? reasons.join('; ') : 'No behavioral anomalies detected',
  };
}

// ---- Aggregate Scorer ----

export interface ScoringInput {
  amount: number;
  avgAmount: number | null;
  totalTransactions: number;
  recentTxCount1h: number;
  avgHourlyTx: number;
  isNewDevice: boolean;
  isKnownFraudulentDevice: boolean;
  hourOfDay: number | null;
  isLateNight: boolean;
  isNewPaymentMethod: boolean;
  isInternational: boolean;
  failureRate: number;
}

export function calculateRiskScore(input: ScoringInput): RiskEngineResult {
  const signals: SignalResult[] = [
    calcAmountDeviation(input.amount, input.avgAmount, input.totalTransactions),
    calcVelocityAnomaly(input.recentTxCount1h, input.avgHourlyTx),
    calcDeviceChange(input.isNewDevice, input.isKnownFraudulentDevice),
    calcTimeOfDayAnomaly(input.hourOfDay, input.isLateNight),
    calcBehavioralDeviation(input.isNewPaymentMethod, input.isInternational, input.failureRate),
  ];

  const rawScore = signals.reduce((sum, s) => sum + s.contribution, 0);
  const score = Math.min(100, Math.max(0, rawScore));
  const level = scoreToLevel(score);

  return { score, level, signals, modelVersion: MODEL_VERSION };
}

function scoreToLevel(score: number): RiskLevel {
  if (score <= 30) return 'LOW';
  if (score <= 60) return 'MEDIUM';
  if (score <= 80) return 'HIGH';
  return 'CRITICAL';
}

// ---- Policy Engine (Deterministic — AI never sets final action) ----

export function evaluatePolicy(
  score: number,
  level: RiskLevel,
  policy: RiskPolicy,
  aiConfidence?: number,
  aiRecommendation?: string
): PolicyDecision {
  // Base action from score thresholds
  let action: PolicyAction;
  if (score <= policy.low_max) action = policy.low_action;
  else if (score <= policy.medium_max) action = policy.medium_action;
  else if (score <= policy.high_max) action = policy.high_action;
  else action = policy.critical_action;

  let reason = `Score ${score} → ${level} → Policy: ${action}`;
  let aiOverrideApplied = false;

  // Safety gate: if AI confidence is low AND score is above human threshold, force review
  if (
    aiConfidence !== undefined &&
    aiConfidence < policy.min_ai_confidence &&
    score > policy.human_approval_threshold
  ) {
    if (action === 'allow' || action === 'verify') {
      action = 'review';
      reason = `Low AI confidence (${aiConfidence}%) + score ${score} above human threshold → escalated to human review`;
      aiOverrideApplied = true;
    }
  }

  // AI can NEVER downgrade action — only the policy can allow
  // (AI recommendation is advisory only, not enforced here)

  const requiresHuman = action === 'review' || action === 'escalate' || score >= policy.human_approval_threshold;

  return {
    action,
    reason,
    policyName: policy.name,
    requiresHuman,
    aiOverrideApplied,
  };
}

// ---- Counterfactual Analysis ----

import type { CounterfactualResult, CounterfactualStep } from '@/types';

export function calculateCounterfactual(
  signals: SignalResult[],
  originalScore: number,
  originalLevel: RiskLevel
): CounterfactualResult {
  // Sort signals by contribution descending
  const sorted = [...signals].sort((a, b) => b.contribution - a.contribution);

  const steps: CounterfactualStep[] = sorted
    .filter(s => s.contribution > 0)
    .map(signal => {
      const scoreWithout = Math.max(0, originalScore - signal.contribution);
      const levelWithout = scoreToLevel(scoreWithout) as RiskLevel;
      return {
        signalType: signal.type,
        description: signal.description,
        currentContribution: signal.contribution,
        scoreWithout,
        scoreReduction: signal.contribution,
        levelWithout,
      };
    });

  return {
    originalScore,
    originalLevel,
    steps,
    disclaimer:
      'These are analytical simulations only. Removing a signal reflects what the score would be without that specific risk factor — it is not a guarantee that the transaction would be approved. Other risk controls and policy rules still apply.',
  };
}

// ---- Default Policy ----

export const DEFAULT_POLICY: Omit<RiskPolicy, 'id' | 'org_id' | 'created_at' | 'updated_at'> = {
  name: 'Default Policy',
  is_active: true,
  low_max: 30,
  medium_max: 60,
  high_max: 80,
  low_action: 'allow',
  medium_action: 'verify',
  high_action: 'review',
  critical_action: 'escalate',
  min_ai_confidence: 70,
  human_approval_threshold: 75,
};
