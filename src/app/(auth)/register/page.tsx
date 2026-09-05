'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface FieldErrors {
  fullName?: string;
  orgName?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

function validate(
  fullName: string,
  orgName: string,
  email: string,
  password: string,
  confirm: string
): FieldErrors {
  const errs: FieldErrors = {};
  if (!fullName.trim()) errs.fullName = 'Full name is required';
  if (!orgName.trim()) errs.orgName = 'Organization name is required';
  if (!email) errs.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email';
  if (!password) errs.password = 'Password is required';
  else if (password.length < 8) errs.password = 'Password must be at least 8 characters';
  else if (!/[A-Z]/.test(password)) errs.password = 'Must include at least one uppercase letter';
  else if (!/[0-9]/.test(password)) errs.password = 'Must include at least one number';
  if (password !== confirm) errs.confirm = 'Passwords do not match';
  return errs;
}

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const fd = new FormData(e.currentTarget);
    const fullName = fd.get('fullName') as string;
    const orgName = fd.get('orgName') as string;
    const email = (fd.get('email') as string).trim().toLowerCase();
    const password = fd.get('password') as string;
    const confirm = fd.get('confirm') as string;

    const errs = validate(fullName, orgName, email, password, confirm);
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);
    try {
      const supabase = createClient();

      // Debug: verify the Supabase client is configured
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || url === 'PASTE_YOUR_ANON_KEY_HERE_eyJ...' || !url.startsWith('https://')) {
        setError('Supabase is not configured. Add your real keys to .env.local and restart the server.');
        setLoading(false);
        return;
      }
      if (!key || key.startsWith('sb_publishable_') || !key.startsWith('eyJ')) {
        setError('Invalid Supabase anon key. You need the classic eyJ... key from Supabase → Settings → API → "anon public". The sb_publishable_ format is not compatible with this SDK version.');
        setLoading(false);
        return;
      }

      // Sign up with Supabase Auth — metadata carries full_name + org_name
      // Server-side trigger creates the users row; org + membership are created
      // via our register API route.
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, org_name: orgName.trim() },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('An account with this email already exists. Please sign in.');
        } else {
          setError(signUpError.message);
        }
        return;
      }

      if (!authData.user) {
        setError('Registration failed. Please try again.');
        return;
      }

      // Call our register API to create the org + membership
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName: orgName.trim(), userId: authData.user.id }),
      });

      if (!regRes.ok) {
        const body = await regRes.json().catch(() => ({}));
        setError(body.error ?? 'Failed to create organization. Please try again.');
        return;
      }

      // If email confirmation is disabled, redirect directly
      if (authData.session) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setSuccess(true);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-2">Check your email</h2>
        <p className="text-sm text-slate-400">
          We sent a confirmation link to your email address. Click it to activate your account, then sign in.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-blue-400 hover:text-blue-300">
          Back to sign in →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-100">Create account</h2>
        <p className="text-sm text-slate-400 mt-1">Set up your risk operations workspace</p>
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
          label="Full name"
          name="fullName"
          type="text"
          autoComplete="name"
          placeholder="Priya Sharma"
          error={fieldErrors.fullName}
          required
        />
        <Input
          label="Organization name"
          name="orgName"
          type="text"
          autoComplete="organization"
          placeholder="Acme Payments"
          error={fieldErrors.orgName}
          required
        />
        <Input
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="priya@acme.com"
          error={fieldErrors.email}
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          error={fieldErrors.password}
          required
        />
        <Input
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={fieldErrors.confirm}
          required
        />

        <Button type="submit" loading={loading} className="w-full mt-2" size="md">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
