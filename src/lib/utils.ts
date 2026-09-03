import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(dateString));
}

export function formatDateShort(dateString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(dateString));
}

export function maskId(id: string, visibleChars = 4): string {
  if (id.length <= visibleChars) return id;
  return `****${id.slice(-visibleChars)}`;
}

export function getRiskLevelColor(level: string): string {
  switch (level) {
    case 'LOW': return 'text-emerald-400';
    case 'MEDIUM': return 'text-amber-400';
    case 'HIGH': return 'text-orange-400';
    case 'CRITICAL': return 'text-red-400';
    default: return 'text-slate-400';
  }
}

export function getRiskLevelBg(level: string): string {
  switch (level) {
    case 'LOW': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'MEDIUM': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'HIGH': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    case 'CRITICAL': return 'bg-red-500/10 text-red-400 border-red-500/20';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

export function getRiskScoreColor(score: number): string {
  if (score <= 30) return '#10b981'; // emerald
  if (score <= 60) return '#f59e0b'; // amber
  if (score <= 80) return '#f97316'; // orange
  return '#ef4444'; // red
}

export function scoreToLevel(score: number, policy?: { low_max: number; medium_max: number; high_max: number }): string {
  const low = policy?.low_max ?? 30;
  const medium = policy?.medium_max ?? 60;
  const high = policy?.high_max ?? 80;
  if (score <= low) return 'LOW';
  if (score <= medium) return 'MEDIUM';
  if (score <= high) return 'HIGH';
  return 'CRITICAL';
}

export function generateCaseNumber(index: number): string {
  const year = new Date().getFullYear();
  return `CASE-${year}-${String(index).padStart(4, '0')}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}
