import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
};

export function Card({ className, children, hover, padding = 'md' }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-800 bg-slate-900/60',
        paddings[padding],
        hover && 'card-hover cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={cn('text-sm font-semibold text-slate-200', className)}>
      {children}
    </h3>
  );
}
