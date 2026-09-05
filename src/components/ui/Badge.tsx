import { cn } from '@/lib/utils';

type Variant = 'default' | 'low' | 'medium' | 'high' | 'critical' | 'blue' | 'purple' | 'ghost';

interface BadgeProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}

const variants: Record<Variant, string> = {
  default:  'bg-slate-700/60 text-slate-300 border-slate-600/50',
  low:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium:   'bg-amber-500/10  text-amber-400  border-amber-500/20',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10    text-red-400    border-red-500/20',
  blue:     'bg-blue-500/10   text-blue-400   border-blue-500/20',
  purple:   'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ghost:    'bg-transparent   text-slate-400  border-slate-700',
};

const dotColors: Record<Variant, string> = {
  default:  'bg-slate-400',
  low:      'bg-emerald-400',
  medium:   'bg-amber-400',
  high:     'bg-orange-400',
  critical: 'bg-red-400',
  blue:     'bg-blue-400',
  purple:   'bg-purple-400',
  ghost:    'bg-slate-500',
};

export function Badge({ variant = 'default', className, children, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}

/** Convenience: renders a risk-level badge automatically from a level string */
export function RiskBadge({
  level,
  score,
  className,
}: {
  level: string;
  score?: number;
  className?: string;
}) {
  const v = level?.toLowerCase() as Variant;
  const map: Record<string, Variant> = {
    low: 'low', medium: 'medium', high: 'high', critical: 'critical',
  };
  return (
    <Badge variant={map[v] ?? 'default'} dot className={className}>
      {score !== undefined ? `${level} · ${score}` : level}
    </Badge>
  );
}
