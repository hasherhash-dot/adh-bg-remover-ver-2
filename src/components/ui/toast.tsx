'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn, createId } from '@/lib/utils';

/**
 * Minimal toast system.
 *
 * Enter and exit are CSS animations rather than an animation library. A toast
 * that slides in and fades out does not justify shipping 5MB of dependency to
 * every visitor, and the browser runs these on the compositor anyway.
 *
 * Exit is handled by marking the toast `leaving`, letting the animation play,
 * then removing it — the job `AnimatePresence` would otherwise do.
 *
 * Rendered in a live region so screen readers announce results without stealing
 * focus. Errors use `assertive` because they interrupt a task.
 */

type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Optional inline retry / undo affordance. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

type ToastInput = Omit<Toast, 'id'>;
type ActiveToast = Toast & { leaving?: boolean };

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Must match the exit animation duration in globals.css. */
const EXIT_MS = 180;
const MAX_VISIBLE = 3;

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return context;
}

const TONE_CONFIG: Record<ToastTone, { icon: typeof Info; iconClass: string; ring: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-success', ring: 'border-line' },
  error: { icon: AlertCircle, iconClass: 'text-danger', ring: 'border-danger/25' },
  info: { icon: Info, iconClass: 'text-ink-muted', ring: 'border-line' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) =>
        current.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
      );
      // Remove once the exit animation has played.
      const timer = setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
        timers.current.delete(`${id}:exit`);
      }, EXIT_MS);
      timers.current.set(`${id}:exit`, timer);
    },
    [clearTimer],
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = createId('toast');
      const duration = input.durationMs ?? (input.tone === 'error' ? 7000 : 4500);

      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...input, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((item) => {
          const config = TONE_CONFIG[item.tone];
          const Icon = config.icon;
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-paper-raised p-3.5 shadow-float',
                item.leaving ? 'toast-leave' : 'toast-enter',
                config.ring,
              )}
              role={item.tone === 'error' ? 'alert' : 'status'}
              aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
            >
              <Icon className={cn('mt-0.5 size-[18px] shrink-0', config.iconClass)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                    {item.description}
                  </p>
                )}
                {item.action && (
                  <button
                    type="button"
                    onClick={() => {
                      item.action?.onClick();
                      dismiss(item.id);
                    }}
                    className="mt-2 text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="-m-1 rounded-xs p-1 text-ink-subtle transition-colors hover:bg-paper-sunken hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
