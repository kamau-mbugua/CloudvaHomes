import type { ReactNode } from 'react';
import { BrandPanel } from './BrandPanel';

/** Brand panel + form panel — the split layout shared by every auth screen. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="au">
      <BrandPanel />

      <div className="au__panel">
        <div className="au__panelhead">
          {/* Stands in for the brand panel once it is hidden on narrow screens. */}
          <span className="au__mobilebrand">
            <img src="/favicon.svg" alt="" aria-hidden="true" />
            Hodi
          </span>
        </div>

        <main className="au__body">{children}</main>
      </div>
    </div>
  );
}
