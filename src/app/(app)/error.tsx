'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in dev — do NOT expose to user in prod
    console.error('[AppError]', error.message);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-lg font-bold text-slate-100 mb-2">Something went wrong</h1>
      <p className="text-sm text-slate-400 max-w-sm mb-6">
        An unexpected error occurred. This has been noted. Please try again or return to the dashboard.
      </p>
      <div className="flex gap-3">
        <Button variant="primary" size="md" onClick={reset}>
          Try again
        </Button>
        <Button variant="ghost" size="md" onClick={() => window.location.href = '/dashboard'}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
