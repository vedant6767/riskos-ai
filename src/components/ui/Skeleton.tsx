import { cn } from '@/lib/utils';

interface SkeletonProps { className?: string; }

/** Single shimmer block */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-800/70', className)}
      aria-hidden="true"
    />
  );
}

/** Full page skeleton that matches the admin page layout */
export function AdminSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Review queue list skeleton */
export function ReviewQueueSkeleton() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-5 w-16 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-48" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-3 w-24 hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Investigation detail skeleton */
export function InvestigationSkeleton() {
  return (
    <div className="space-y-5 max-w-5xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-800 pb-0">
        {['Investigation', 'Trust Receipt', 'Audit Trail'].map(t => (
          <Skeleton key={t} className="h-9 w-28 rounded-t-lg" />
        ))}
      </div>
      {/* Two-col layout */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <Skeleton className="h-4 w-36" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-24 w-24 rounded-full" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20 rounded-lg" />
          </div>
        </div>
      </div>
      {/* Signal bars */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-2.5 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}
