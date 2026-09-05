// ============================================================
// Circuit Breaker for Gemini AI
// After 5 consecutive failures → open for 2 minutes → half-open test
// State is module-level (process memory) — resets on cold start
// ============================================================

export type BreakerState = 'closed' | 'open' | 'half-open';

interface BreakerStatus {
  state: BreakerState;
  failures: number;
  lastFailureAt: number | null;
  openedAt: number | null;
  totalTrips: number;
}

// Config
const FAILURE_THRESHOLD = 5;        // trips breaker
const RESET_TIMEOUT_MS  = 2 * 60 * 1000; // 2 minutes open before half-open

const status: BreakerStatus = {
  state:         'closed',
  failures:      0,
  lastFailureAt: null,
  openedAt:      null,
  totalTrips:    0,
};

export function getBreakerStatus(): Readonly<BreakerStatus> {
  return { ...status };
}

/**
 * Returns true if the call is allowed through.
 * Handles closed → open transition and open → half-open timeout.
 */
export function canCall(): boolean {
  if (status.state === 'closed') return true;

  if (status.state === 'open') {
    const now = Date.now();
    if (status.openedAt && now - status.openedAt >= RESET_TIMEOUT_MS) {
      // Transition to half-open — allow one probe call
      status.state = 'half-open';
      console.info('[CircuitBreaker] → half-open (probe call allowed)');
      return true;
    }
    return false;
  }

  // half-open: allow exactly one call through
  return true;
}

/** Called on successful AI response */
export function recordSuccess(): void {
  if (status.state === 'half-open') {
    console.info('[CircuitBreaker] probe succeeded → closed');
  }
  status.state    = 'closed';
  status.failures = 0;
  status.openedAt = null;
}

/** Called on any AI failure. Returns true if the breaker just opened. */
export function recordFailure(): boolean {
  status.failures++;
  status.lastFailureAt = Date.now();

  if (status.state === 'half-open') {
    // Probe failed — reopen immediately
    status.state   = 'open';
    status.openedAt = Date.now();
    status.totalTrips++;
    console.warn('[CircuitBreaker] probe failed → re-opened');
    return true;
  }

  if (status.state === 'closed' && status.failures >= FAILURE_THRESHOLD) {
    status.state   = 'open';
    status.openedAt = Date.now();
    status.totalTrips++;
    console.warn(
      `[CircuitBreaker] OPENED after ${status.failures} consecutive failures. ` +
      `Will retry in ${RESET_TIMEOUT_MS / 1000}s.`
    );
    return true;
  }

  return false;
}

/** How long until the breaker auto-resets (ms). -1 if closed. */
export function msUntilReset(): number {
  if (status.state !== 'open' || !status.openedAt) return -1;
  return Math.max(0, RESET_TIMEOUT_MS - (Date.now() - status.openedAt));
}
