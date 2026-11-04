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

      {asking ? (
        <ConfirmDialog
          what={what}
          consequence={consequence}
          verb={verb}
          busy={busy}
          onClose={() => setAsking(false)}
          onConfirm={onConfirm}
        />
      ) : null}
    </>
  );
}

/**
 * The "Delete …?" question on its own — for when the action starts somewhere other than a
 * delete button, e.g. a "More" menu item. Render it while asking; it closes itself before
 * confirming.
 */
export function ConfirmDialog({
  what,
  consequence,
  verb = 'Delete',
  busy = false,
  onClose,
  onConfirm,
}: {
  what: string;
  consequence?: string;
  verb?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="nx-sheet" role="dialog" aria-modal="true" aria-label={`${verb} ${what}`}>
      <DialogBehaviour onClose={onClose} busy={busy} />
      <div className="nx-sheet__panel">
        <header className="nx-sheet__head"><h2>{verb} {what}?</h2></header>
        <p>{consequence ?? 'This cannot be undone.'}</p>
        <div className="nx-sheet__actions">
          <button type="button" className="nx-btn" onClick={onClose}>Keep it</button>
          <button
            type="button"
            className="nx-btn nx-btn--danger-solid"
            disabled={busy}
            onClick={() => { onClose(); onConfirm(); }}
          >
            {busy ? 'Working…' : verb}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
