import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service role client — bypasses RLS.
// NEVER import this in client-side code or expose to the browser.
// Lazily initialised — safe during next build when env vars may be absent.

let _client: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_client) return _client;

  const url  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
  const key  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  // During `next build` on Vercel the env vars ARE present (Vercel injects them).
  // During local `next build` without env vars we use a stub so compilation
  // succeeds — the stub client is never called at runtime.
  if (!url || !key) {
    return createClient('http://localhost:54321', 'build-stub-key', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _client;
}

// Convenience singleton — call getAdminClient() in server code
// This is synchronous so it's safe to use at module top-level in API routes
export const supabaseAdmin: SupabaseClient = new Proxy(
  {} as SupabaseClient,
  {
    get(_t, prop: string | symbol) {
      return (getAdminClient() as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
);
