import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useDialogBehaviour } from '../lib/useDialogBehaviour';

/**
 * A modal panel. Ported from pos-react.
 *
 * - **Escape closes it.**
 * - **Clicking the backdrop closes it**, but only a press that STARTED on the backdrop: a
 *   drag that began inside (selecting text) must not dismiss work in progress.
 * - **Focus moves in and comes back**, and **Tab is trapped inside**.
 * - **Rendered through a portal**, so it is never clipped by an `overflow` ancestor.
 *
 * `onClose` is not called while a save is in flight — closing mid-write would leave the
 * person unsure whether it happened.
 */
export function Sheet({
  label,
  title,
  wide = false,
  busy = false,
  onClose,
  children,
  footer,
}: {
  /** Names the dialog for screen readers. Defaults to the visible title. */
  label?: string;
  title: ReactNode;
  wide?: boolean;
  /** While true, Escape and backdrop clicks are ignored. */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  // The same Escape, tab-trap and focus-restore DialogBehaviour provides — one
  // implementation, not two.
  useDialogBehaviour(() => backdrop.current, close, busy);

  return createPortal(
    <div
      ref={backdrop}
      className="nx-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
    >
      <div className={`nx-sheet__panel ${wide ? 'nx-sheet__panel--wide' : ''}`} ref={panel}>
        <header className="nx-sheet__head">
          <h2>{title}</h2>
          <button
            type="button"
            className="nx-sheet__x"
            aria-label="Close"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </header>

        {children}

        {footer ? <div className="nx-sheet__actions">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
