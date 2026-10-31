import { useEffect, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';

export type SpinnerTone = 'light' | 'navy' | 'money';

export interface SpinnerProps {
  size?: number;
  tone?: SpinnerTone;
  className?: string;
}

/**
 * Pattern 2 — Inline ring spinner (§08 Loading).
 * - light: #ece9e0 track + #4d6b10 spinning arc
 * - navy:  rgba(255,255,255,0.16) track + #84bd00 spinning arc
 * - money: rgba(0,43,77,0.25) track + #002b4d spinning arc (inside #84bd00 lime buttons)
 */
export function Spinner({ size = 18, tone = 'light', className }: SpinnerProps) {
  const track =
    tone === 'navy'
      ? 'rgba(255, 255, 255, 0.16)'
      : tone === 'money'
        ? 'rgba(0, 43, 77, 0.25)'
        : 'var(--muted, #ece9e0)';
  const arc =
    tone === 'navy'
      ? '#84bd00'
      : tone === 'money'
        ? '#002b4d'
        : 'var(--accent, #4d6b10)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={['kh-spin', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke={track}
        strokeWidth="2.8"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke={arc}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Pattern 3 — Warm paper table skeleton (§08 Loading).
 */
export function TableSkeleton({ rows = 5, label = 'Loading records…' }: { rows?: number; label?: string }) {
  return (
    <div className="kh-skel-table" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="kh-skel-row">
          <div className="kh-skel" style={{ height: 13, width: i % 2 === 0 ? '82%' : '68%' }} />
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="kh-skel" style={{ height: 13, width: i % 2 === 0 ? '58%' : '46%' }} />
            <div className="kh-skel" style={{ height: 10, width: '34%' }} />
          </div>
          <div className="kh-skel" style={{ height: 13, width: '72%', justifySelf: 'end' }} />
          <div
            className="kh-skel"
            style={{ height: 22, width: 64, borderRadius: 999, justifySelf: 'end' }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Pattern 3 — Warm paper KPI / summary card skeleton (§08 Loading).
 */
export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="kh-skel-cards" role="status" aria-busy="true" aria-label="Loading summary…">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kh-skel-card">
          <div className="kh-skel" style={{ height: 11, width: '48%' }} />
          <div className="kh-skel" style={{ height: 26, width: '72%' }} />
          <div className="kh-skel" style={{ height: 11, width: '56%' }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Pattern 4 — Determinate batch progress bar (§08 Loading).
 */
export interface BatchProgressBarProps {
  title: string;
  completed: number;
  total: number;
  currentLabel?: string;
  onCancel?: () => void;
}

export function BatchProgressBar({
  title,
  completed,
  total,
  currentLabel,
  onCancel,
}: BatchProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <div
      className="kh-batch"
      role="progressbar"
      aria-valuenow={completed}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={title}
    >
      <div className="kh-batch__head">
        <span className="kh-batch__title">{title}</span>
        <span className="kh-batch__count">
          {completed} of {total}
        </span>
      </div>
      <div className="kh-batch__track">
        <div className="kh-batch__fill" style={{ width: `${pct}%` }} />
      </div>
      {(currentLabel || onCancel) && (
        <div className="kh-batch__meta">
          <span>{currentLabel ?? ''}</span>
          {onCancel && (
            <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pattern 5 — 3px top-bar route / query progress bar (§08 Loading).
 * Only becomes visible when a query takes longer than 300ms so fast navigations stay silent.
 */
export function TopRouteProgress() {
  const fetching = useIsFetching();
  const isFetching = fetching > 0;
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!isFetching) return;
    const timer = window.setTimeout(() => setDelayed(true), 300);
    return () => {
      window.clearTimeout(timer);
      setDelayed(false);
    };
  }, [isFetching]);

  if (!isFetching || !delayed) return null;

  return (
    <div className="kh-topbar" aria-hidden="true">
      <div className="kh-topbar__bar" />
    </div>
  );
}
