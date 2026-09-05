import { createClient } from '@supabase/supabase-js';

// Service role client — bypasses RLS.
// NEVER import this in client-side code or expose to the browser.
// Used only in API routes and server actions.

let _adminClient: ReturnType<typeof createClient> | null = null;

export function getAdminClient() {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || url === 'your_supabase_project_url_here') {
    // Build-time stub — never used at runtime
    // At runtime the real env vars are always required
    if (typeof window === 'undefined' && !process.env.VERCEL_ENV) {
      return createClient('http://localhost:54321', 'stub-build-key', {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    throw new Error(
      '[RiskOS] SUPABASE_SERVICE_ROLE_KEY is required but not set. ' +
      'Add it to .env.local or Vercel environment variables.'
    );
  }

  _adminClient = createClient(url, key.trim(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}

// Named export for convenience — lazily resolved at first use
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    const client = getAdminClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') return value.bind(client);
    return value;
  },
});
