// ============================================================
// RiskOS AI — Synthetic Transaction Generator
// Generates realistic transaction data with risk-relevant features
// Includes deliberate borderline/ambiguous cases
// ============================================================

import type { PaymentMethod, PaymentStatus, DatasetSplit } from '@/types';

// Seeds for deterministic generation
const CUSTOMER_COUNT = 80;
const DEVICE_COUNT = 120;

const PAYMENT_METHODS: PaymentMethod[] = ['card', 'upi', 'netbanking', 'wallet', 'emi', 'bnpl'];
const PAYMENT_STATUSES: PaymentStatus[] = ['success', 'failed', 'pending', 'refunded', 'disputed'];

// Realistic Indian merchant transaction amounts (in INR)
const AMOUNT_PROFILES = [
  { min: 100, max: 500, weight: 25 },    // Small: food, transport
  { min: 500, max: 2000, weight: 30 },   // Medium: retail
  { min: 2000, max: 10000, weight: 25 }, // Large: electronics, travel
  { min: 10000, max: 50000, weight: 15 },// High: jewelry, appliances
  { min: 50000, max: 200000, weight: 5 },// Very high: rare
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
}

function weightedPick<T>(items: T[], weights: number[], rand: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function generateAmount(rand: () => number): number {
  const profile = weightedPick(
    AMOUNT_PROFILES,
    AMOUNT_PROFILES.map(p => p.weight),
    rand
  );
  const amount = profile.min + rand() * (profile.max - profile.min);
  // Round to realistic values
  if (amount < 1000) return Math.round(amount / 10) * 10;
  if (amount < 10000) return Math.round(amount / 50) * 50;
  return Math.round(amount / 100) * 100;
}

export interface SyntheticCustomer {
  external_id: string;
  account_age_days: number;
  avg_transaction_amount: number;
  preferred_payment_method: PaymentMethod;
  typical_hour_range: [number, number]; // e.g. [9, 21]
  risk_profile: 'low' | 'medium' | 'high';
  total_transactions: number;
}

export interface SyntheticDevice {
  device_fingerprint: string;
  device_type: string;
  os: string;
  is_known_fraudulent: boolean;
}

export interface SyntheticTransaction {
  external_tx_id: string;
  customer_index: number;
  device_index: number;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  hour_of_day: number;
  day_of_week: number;
  is_international: boolean;
  ip_country: string;
  is_fraud: boolean;
  dataset_split: DatasetSplit;
  // Risk scoring inputs
  is_new_device: boolean;
  recent_tx_count_1h: number;
  is_new_payment_method: boolean;
  failure_rate: number;
  // Metadata
  created_at: Date;
}

export function generateSyntheticDataset(seed = 42): {
  customers: SyntheticCustomer[];
  devices: SyntheticDevice[];
  transactions: SyntheticTransaction[];
} {
  const rand = seededRandom(seed);

  // Generate customers
  const customers: SyntheticCustomer[] = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
    const riskProfile = i < 10 ? 'high' : i < 30 ? 'medium' : 'low';
    return {
      external_id: `CU_${String(Math.floor(rand() * 900000 + 100000)).slice(-6)}`,
      account_age_days: Math.floor(rand() * 1800) + 10,
      avg_transaction_amount: generateAmount(rand),
      preferred_payment_method: PAYMENT_METHODS[Math.floor(rand() * PAYMENT_METHODS.length)],
      typical_hour_range: riskProfile === 'high'
        ? [0, 23] as [number, number]
        : [8, 22] as [number, number],
      risk_profile: riskProfile,
      total_transactions: Math.floor(rand() * 200) + 1,
    };
  });

  // Generate devices
  const devices: SyntheticDevice[] = Array.from({ length: DEVICE_COUNT }, (_, i) => ({
    device_fingerprint: `dev_${String(seed + i).padStart(8, '0')}${Math.floor(rand() * 99999)}`,
    device_type: weightedPick(['mobile', 'desktop', 'tablet'], [60, 30, 10], rand),
    os: weightedPick(['Android', 'iOS', 'Windows', 'macOS'], [40, 30, 20, 10], rand),
    is_known_fraudulent: i < 5, // First 5 devices are flagged
  }));

  // Generate transactions
  const transactions: SyntheticTransaction[] = [];
  const now = new Date();
  let txIndex = 0;

  for (let i = 0; i < 2000; i++) {
    const customerIndex = Math.floor(rand() * CUSTOMER_COUNT);
    const customer = customers[customerIndex];
    const isFraudulent = generateIsFraudulent(customer, rand);

    // For fraudulent transactions, use suspicious patterns
    const deviceIndex = isFraudulent
      ? Math.floor(rand() * 10) // High-risk devices cluster in first 10
      : Math.floor(rand() * DEVICE_COUNT);

    const device = devices[deviceIndex];

    // Time patterns
    let hourOfDay: number;
    if (isFraudulent && rand() > 0.3) {
      hourOfDay = Math.floor(rand() * 5); // Late night for fraud
    } else {
      hourOfDay = customer.typical_hour_range[0] +
        Math.floor(rand() * (customer.typical_hour_range[1] - customer.typical_hour_range[0]));
    }

    // Amount: fraudulent txns often deviate significantly
    let amount: number;
    if (isFraudulent && rand() > 0.4) {
      amount = customer.avg_transaction_amount * (2 + rand() * 4); // 2-6x normal
      amount = Math.round(amount / 100) * 100;
    } else {
      amount = generateAmount(rand);
    }

    // Velocity: fraudulent accounts cluster transactions
    const recentTxCount = isFraudulent
      ? Math.floor(rand() * 8) + 2  // 2-10 txns in last hour
      : Math.floor(rand() * 2);     // 0-1 normally

    // Dataset split: first 1400 = dev, last 600 = test
    const split: DatasetSplit = i < 1400 ? 'dev' : 'test';

    // Created at: spread over last 90 days
    const daysAgo = Math.floor(rand() * 90);
    const hoursAgo = Math.floor(rand() * 24);
    const createdAt = new Date(now.getTime() - (daysAgo * 86400 + hoursAgo * 3600) * 1000);
    createdAt.setHours(hourOfDay, Math.floor(rand() * 60), 0, 0);

    const isInternational = rand() > 0.9; // 10% international

    // Borderline cases (i 1700-1750 in dev, i 1950-1975 in test): ambiguous
    const isBorderline = (i >= 1700 && i <= 1750) || (i >= 1950 && i <= 1975);
    const finalFraud = isBorderline
      ? rand() > 0.5 // 50/50 for borderline
      : isFraudulent;

    // Payment status
    let paymentStatus: PaymentStatus;
    if (finalFraud) {
      paymentStatus = weightedPick(
        ['success', 'failed', 'disputed', 'refunded', 'pending'],
        [30, 30, 20, 15, 5],
        rand
      );
    } else {
      paymentStatus = weightedPick(
        ['success', 'failed', 'pending', 'refunded', 'disputed'],
        [75, 10, 8, 5, 2],
        rand
      );
    }

    transactions.push({
      external_tx_id: `TX_${String(++txIndex).padStart(8, '0')}`,
      customer_index: customerIndex,
      device_index: deviceIndex,
      amount,
      currency: 'INR',
      payment_method: customer.preferred_payment_method,
      payment_status: paymentStatus,
      hour_of_day: hourOfDay,
      day_of_week: createdAt.getDay(),
      is_international: isInternational,
      ip_country: isInternational ? 'US' : 'IN',
      is_fraud: finalFraud,
      dataset_split: split,
      is_new_device: deviceIndex >= DEVICE_COUNT * 0.7 && rand() > 0.5,
      recent_tx_count_1h: recentTxCount,
      is_new_payment_method: rand() > 0.8,
      failure_rate: finalFraud ? rand() * 0.6 : rand() * 0.15,
      created_at: createdAt,
    });
  }

  return { customers, devices, transactions };
}

function generateIsFraudulent(customer: SyntheticCustomer, rand: () => number): boolean {
  // Base fraud rate: ~15% overall
  if (customer.risk_profile === 'high') return rand() > 0.45; // ~55% fraud
  if (customer.risk_profile === 'medium') return rand() > 0.75; // ~25% fraud
  return rand() > 0.93; // ~7% fraud for low-risk customers
}
