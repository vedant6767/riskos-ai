import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';

// ---- Rate limit config per route pattern ----
function getRateLimit(pathname: string): { limit: number; windowMs: number } | null {
  // Auth endpoints — strictest
  if (
    pathname === '/api/auth/register' ||
    pathname === '/login' ||
    pathname === '/register'
  ) {
    return { limit: 10, windowMs: 60_000 };
  }
  // Heavy mutations
  if (
    pathname.startsWith('/api/investigations') ||
    pathname.startsWith('/api/review-queue') ||
    pathname.startsWith('/api/simulate-spike') ||
    pathname.startsWith('/api/seed') ||
    pathname.startsWith('/api/evaluation/run')
  ) {
    return { limit: 20, windowMs: 60_000 };
  }
  // General API
  if (pathname.startsWith('/api/')) {
    return { limit: 120, windowMs: 60_000 };
  }
  return null; // No rate limit for static/page routes
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ---- Rate limiting ----
  const rl = getRateLimit(pathname);
  if (rl) {
    const ip = (
      request.headers.get('x-real-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      'unknown'
    );
    const key = `${pathname.split('/').slice(0, 3).join('/')}:${ip}`;
    const result = checkRateLimit(key, rl.limit, rl.windowMs);

    if (!result.allowed) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests', retryAfter: result.retryAfter }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...rateLimitHeaders(result),
          },
        }
      );
    }
    // Attach headers to pass-through responses later
  }

  // ---- Supabase auth session refresh ----
  const supabaseUrl  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
  const supabaseAnon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Always getUser() — never getSession() alone — validates JWT server-side
  const { data: { user } } = await supabase.auth.getUser();

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/transactions') ||
    pathname.startsWith('/investigations') ||
    pathname.startsWith('/review-queue') ||
    pathname.startsWith('/evaluation') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/dashboard') ||
    pathname.startsWith('/api/cases') ||
    pathname.startsWith('/api/transactions') ||
    pathname.startsWith('/api/investigations') ||
    pathname.startsWith('/api/review-queue') ||
    pathname.startsWith('/api/evaluation') ||
    pathname.startsWith('/api/audit') ||
    pathname.startsWith('/api/seed') ||
    pathname.startsWith('/api/simulate-spike') ||
    pathname.startsWith('/api/admin');

  if (isProtectedRoute && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/reset-password';

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Attach rate-limit headers to successful responses
  if (rl) {
    const ip = (
      request.headers.get('x-real-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      'unknown'
    );
    const key = `${pathname.split('/').slice(0, 3).join('/')}:${ip}`;
    const result = checkRateLimit(key, rl.limit, rl.windowMs);
    Object.entries(rateLimitHeaders(result)).forEach(([k, v]) =>
      response.headers.set(k, v)
    );
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
