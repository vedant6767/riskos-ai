'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'request' | 'set'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});

  // Supabase puts the recovery token in the URL hash as #access_token=...&type=recovery
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setMode('set');
    }
  }, []);

  async function handleRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const fd = new FormData(e.currentTarget);
    const email = (fd.get('email') as string).trim();

    if (!email) { setFieldErrors({ email: 'Email is required' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldErrors({ email: 'Enter a valid email address' });
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) { setError(err.message); return; }
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const fd = new FormData(e.currentTarget);
    const password = fd.get('password') as string;
    const confirm = fd.get('confirm') as string;

    const errs: typeof fieldErrors = {};
    if (!password) errs.password = 'Password is required';
    else if (password.length < 8) errs.password = 'Must be at least 8 characters';
    else if (!/[A-Z]/.test(password)) errs.password = 'Must include at least one uppercase letter';
    else if (!/[0-9]/.test(password)) errs.password = 'Must include at least one number';
    if (password !== confirm) errs.confirm = 'Passwords do not match';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); return; }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  if (success && mode === 'request') {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-2">Check your email</h2>
        <p className="text-sm text-slate-400 mb-4">
          If that email exists, we sent a password reset link. Check your inbox.
        </p>
        <Link href="/login" className="text-sm text-blue-400 hover:text-blue-300">
          Back to sign in →
        </Link>
      </div>
    );
  }

  if (success && mode === 'set') {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-2">Password updated</h2>
        <p className="text-sm text-slate-400">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-100">
          {mode === 'request' ? 'Reset password' : 'Set new password'}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          {mode === 'request'
            ? "Enter your email and we'll send a reset link"
            : 'Choose a strong new password'}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3" role="alert">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {mode === 'request' ? (
        <form onSubmit={handleRequest} className="space-y-4" noValidate>
          <Input
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={fieldErrors.email}
            required
          />
          <Button type="submit" loading={loading} className="w-full" size="md">
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSet} className="space-y-4" noValidate>
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Min 8 chars, 1 uppercase, 1 number"
            error={fieldErrors.password}
            required
          />
          <Input
            label="Confirm new password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            error={fieldErrors.confirm}
            required
          />
          <Button type="submit" loading={loading} className="w-full" size="md">
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-slate-500">
        Remember it?{' '}
        <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
