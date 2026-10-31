import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DialogBehaviour } from './DialogBehaviour';

/**
 * A delete button that asks first. Ported from pos-react.
 *
 * For list rows, where the consequence fits in one sentence and the value is simply the
 * pause. Rendered through a portal, because these buttons sit inside `overflow`
 * containers and inside other dialogs, where a nested panel would be clipped or trapped.
 */
export function ConfirmDelete({
  onConfirm,
  what,
  consequence,
  busy = false,
  label = 'Delete',
  verb = 'Delete',
  size = 'sm',
}: {
  onConfirm: () => void;
  /** Names the thing, and completes "Delete …?" — e.g. `the "Executive" category`. */
  what: string;
  /** One sentence on what changes. Omit when there is genuinely nothing to add. */
  consequence?: string;
  busy?: boolean;
  label?: string;
  /** The word in the question and on the confirming button — "Remove" for a membership. */
  verb?: string;
  size?: 'sm' | 'md';
}) {
  const [asking, setAsking] = useState(false);

  const close = () => setAsking(false);

  return (
    <>
      <button
        type="button"
        className={`nx-btn ${size === 'sm' ? 'nx-btn--sm ' : ''}nx-btn--danger`}
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>

      {asking
        ? createPortal(
            <div className="nx-sheet" role="dialog" aria-modal="true" aria-label={`${verb} ${what}`}>
              <DialogBehaviour onClose={close} busy={busy} />
              <div className="nx-sheet__panel">
                <header className="nx-sheet__head"><h2>{verb} {what}?</h2></header>
                <p>{consequence ?? 'This cannot be undone.'}</p>
                <div className="nx-sheet__actions">
                  <button type="button" className="nx-btn" onClick={close}>Keep it</button>
                  <button
                    type="button"
                    className="nx-btn nx-btn--danger-solid"
                    disabled={busy}
                    onClick={() => { close(); onConfirm(); }}
                  >
                    {busy ? 'Working…' : verb}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
