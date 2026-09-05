'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const fd = new FormData(e.currentTarget);
    const email = (fd.get('email') as string).trim();
    const password = fd.get('password') as string;

    // Client-side validation
    const errs: typeof fieldErrors = {};
    if (!email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email';
    if (!password) errs.password = 'Password is required';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? 'Incorrect email or password. Please try again.'
            : authError.message
        );
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-100">Sign in</h2>
        <p className="text-sm text-slate-400 mt-1">Access your risk operations dashboard</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 flex items-start gap-2.5" role="alert">
          <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="analyst@merchant.com"
          error={fieldErrors.email}
          required
        />
        <div className="space-y-1">
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            error={fieldErrors.password}
            required
          />
          <div className="flex justify-end">
            <Link
              href="/reset-password"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" loading={loading} className="w-full mt-2" size="md">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        No account?{' '}
        <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
          Create one
        </Link>
      </p>

      {/* Demo shortcut hint */}
      <div className="mt-5 rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-3">
        <p className="text-xs text-slate-400 font-medium mb-1">Demo credentials</p>
        <p className="text-xs text-slate-500">Register a new account — the first user in an org is auto-granted ADMIN role. After login, hit <span className="text-blue-400">Seed Data</span> on the dashboard.</p>
      </div>
    </div>
  );
}
