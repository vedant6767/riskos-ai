// ============================================================
// In-process rate limiter — sliding window, per key
// Suitable for Vercel serverless (process-level, resets per cold start)
// For multi-instance prod, replace backing store with Upstash Redis
// ============================================================

interface Window {
  count: number;
  windowStart: number;
}

const store = new Map<string, Window>();

// Cleanup old entries every 5 minutes to avoid memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    store.forEach((win, key) => {
      if (now - win.windowStart > 60_000 * 10) store.delete(key);
    });
  }, 5 * 60 * 1000);
}

export interface RateLimitResult {
  allowed:    boolean;
  limit:      number;
  remaining:  number;
  resetAt:    number; // unix ms
  retryAfter: number; // seconds
}

/**
 * Check rate limit for a key.
 * @param key      Unique identifier (e.g. "ip:1.2.3.4" or "user:uuid")
 * @param limit    Max requests allowed
 * @param windowMs Sliding window duration in ms
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed:    true,
      limit,
      remaining:  limit - 1,
      resetAt:    now + windowMs,
      retryAfter: 0,
    };
  }

  existing.count++;

  if (existing.count > limit) {
    const resetAt    = existing.windowStart + windowMs;
    const retryAfter = Math.ceil((resetAt - now) / 1000);
    return {
      allowed:    false,
      limit,
      remaining:  0,
      resetAt,
      retryAfter,
    };
  }

  return {
    allowed:    true,
    limit,
    remaining:  limit - existing.count,
    resetAt:    existing.windowStart + windowMs,
    retryAfter: 0,
  };
}

// ---- Pre-configured limiters ----

/** Auth endpoints: 10 req / 60s per IP */
export function authRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`auth:${ip}`, 10, 60_000);
}

/** General API endpoints: 120 req / 60s per user/IP */
export function apiRateLimit(key: string): RateLimitResult {
  return checkRateLimit(`api:${key}`, 120, 60_000);
}

/** Mutation endpoints (investigations, decide, spike): 20 req / 60s per user */
export function mutationRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(`mut:${userId}`, 20, 60_000);
}

/** Evaluation runs: 5 per user per 5 minutes */
export function evalRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(`eval:${userId}`, 5, 5 * 60_000);
}

// ---- Helper: extract real IP from Next.js request ----
export function getClientIp(request: Request): string {
  const headers = new Headers((request as Request & { headers: Headers }).headers);
  return (
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

// ---- Helper: build rate-limit response headers ----
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit':     String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset':     String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfter) }),
  };
}
