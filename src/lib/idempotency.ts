// ============================================================
// Idempotency key store — in-process, per operation
// Prevents duplicate scoring/spike on client retry
// For multi-instance prod: replace with Redis SETNX
// ============================================================

interface IdempotencyRecord {
  status:     'processing' | 'complete';
  result:     unknown;
  createdAt:  number;
}

// TTL: 10 minutes
const TTL_MS = 10 * 60 * 1000;
const store  = new Map<string, IdempotencyRecord>();

// Periodic cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    store.forEach((v, k) => {
      if (now - v.createdAt > TTL_MS) store.delete(k);
    });
  }, 5 * 60 * 1000);
}

/**
 * Check if a key exists.
 * Returns the cached result if the operation already completed.
 * Returns null if the key is new or expired.
 * Returns { processing: true } if in-flight.
 */
export function checkIdempotency(key: string): {
  exists: false;
} | {
  exists: true;
  processing: boolean;
  result: unknown;
} {
  const rec = store.get(key);
  if (!rec || Date.now() - rec.createdAt > TTL_MS) return { exists: false };
  return { exists: true, processing: rec.status === 'processing', result: rec.result };
}

/** Mark a key as in-flight */
export function startIdempotency(key: string): void {
  store.set(key, { status: 'processing', result: null, createdAt: Date.now() });
}

/** Mark a key as complete with the result payload */
export function completeIdempotency(key: string, result: unknown): void {
  const rec = store.get(key);
  if (rec) {
    rec.status  = 'complete';
    rec.result  = result;
  } else {
    store.set(key, { status: 'complete', result, createdAt: Date.now() });
  }
}

/**
 * Extract idempotency key from request headers.
 * Clients send: `Idempotency-Key: <uuid>`
 * Returns null if not present (operation proceeds without idempotency guard).
 */
export function getIdempotencyKey(request: Request): string | null {
  return (request as Request & { headers: Headers }).headers.get('idempotency-key');
}
