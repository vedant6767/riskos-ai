// ============================================================
// RiskOS AI — Evaluation Metrics (Deterministic, no LLM)
// ============================================================

import type { EvaluationMetrics } from '@/types';

export interface PredictionRecord {
  transactionId: string;
  actualFraud: boolean;
  predictedScore: number;
  amount: number;
}

export function calculateMetrics(
  records: PredictionRecord[],
  threshold: number
): EvaluationMetrics {
  let TP = 0, FP = 0, TN = 0, FN = 0;
  let fraudAmountCaught = 0;
  let falsePositiveAmount = 0;
  let falseNegativeAmount = 0;

  for (const r of records) {
    const predicted = r.predictedScore >= threshold;
    const actual = r.actualFraud;

    if (predicted && actual) {
      TP++;
      fraudAmountCaught += r.amount;
    } else if (predicted && !actual) {
      FP++;
      falsePositiveAmount += r.amount;
    } else if (!predicted && !actual) {
      TN++;
    } else {
      FN++;
      falseNegativeAmount += r.amount;
    }

    if (actual) { /* fraud transaction — already tracked */ }
  }

  const precision = TP + FP > 0 ? TP / (TP + FP) : 0;
  const recall = TP + FN > 0 ? TP / (TP + FN) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = FP + TN > 0 ? FP / (FP + TN) : 0;
  const fnr = FN + TP > 0 ? FN / (FN + TP) : 0;

  const totalTransactions = records.length;
  const fraudTransactions = records.filter(r => r.actualFraud).length;
  const avgTxAmount = records.length > 0
    ? records.reduce((sum, r) => sum + r.amount, 0) / records.length
    : 0;

  return {
    threshold,
    truePositives: TP,
    falsePositives: FP,
    trueNegatives: TN,
    falseNegatives: FN,
    precision: parseFloat(precision.toFixed(4)),
    recall: parseFloat(recall.toFixed(4)),
    f1: parseFloat(f1.toFixed(4)),
    falsePositiveRate: parseFloat(fpr.toFixed(4)),
    falseNegativeRate: parseFloat(fnr.toFixed(4)),
    avgTxAmount: parseFloat(avgTxAmount.toFixed(2)),
    falsePositiveCost: parseFloat(falsePositiveAmount.toFixed(2)),
    falseNegativeCost: parseFloat(falseNegativeAmount.toFixed(2)),
    fraudCaughtValue: parseFloat(fraudAmountCaught.toFixed(2)),
    totalTransactions,
    fraudTransactions,
  };
}

export function calculateMetricsAtMultipleThresholds(
  records: PredictionRecord[],
  thresholds: number[] = [20, 30, 40, 50, 60, 70, 80]
): EvaluationMetrics[] {
  return thresholds.map(t => calculateMetrics(records, t));
}
