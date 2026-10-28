import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastContext } from '../lib/toastContext';
import type { ToastApi } from '../lib/toastContext';
import type { ReactNode } from 'react';

/**
 * Brief confirmations and failures, shown where the eye already is. Ported from pos-react.
 *
 * Announced through a live region so the confirmation is not purely visual: failures
 * assertively (they interrupt), successes politely.
 *
 * Inline errors are NOT replaced: where a message explains what to fix in a form the
 * person is still filling in, it belongs beside the form, not in a toast that vanishes.
 */

type ToastKind = 'success' | 'error';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}


const LIFETIME: Record<ToastKind, number> = {
  success: 4000,
  // Longer: a failure usually needs reading twice, and often copying.
  error: 8000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = (nextId.current += 1);

    setToasts((current) => [...current, { id, kind, message }]);
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME[kind]));
  }, [dismiss]);

  // Pending timers outlive the component otherwise, and fire setState on an unmounted
  // tree during a route change.
  useEffect(() => {
    const pending = timers.current;

    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({
    saved: (message: string) => push('success', message),
    failed: (message: string) => push('error', message),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div className="tst" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`tst__item tst__item--${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className="tst__close"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
