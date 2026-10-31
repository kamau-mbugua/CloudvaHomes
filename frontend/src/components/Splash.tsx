import { BrandLockup } from './BrandMark';

/**
 * Pattern 1 — Branded C2.1 sequential 3-bar splash loader (§08 Loading).
 * The three ledger bars under the roof chevron draw in sequentially (`18px -> 13px -> 8px`).
 */
export function Splash({ label = 'Checking your session…' }: { label?: string }) {
  return (
    <div className="splash" role="status" aria-live="polite" aria-busy="true">
      <BrandLockup tone="light" size="lg" animated />
      <span className="splash__label">{label}</span>
    </div>
  );
}
