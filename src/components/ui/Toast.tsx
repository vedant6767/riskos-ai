'use client';
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

const styles: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  error:   'border-red-500/30 bg-red-500/10 text-red-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  info:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const toast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { id, type, title, message }]);
    const timer = setTimeout(() => dismiss(id), 4000);
    timers.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach(t => clearTimeout(t)); };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl pointer-events-auto',
              'bg-slate-900 border-slate-700 min-w-[280px] max-w-[360px]',
              'animate-slide-up'
            )}
          >
            <span className={cn('text-sm font-bold shrink-0 mt-0.5', styles[t.type].split(' ').at(-1))}>
              {icons[t.type]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200">{t.title}</p>
              {t.message && <p className="text-xs text-slate-400 mt-0.5">{t.message}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-slate-500 hover:text-slate-300 text-lg leading-none mt-0.5"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
