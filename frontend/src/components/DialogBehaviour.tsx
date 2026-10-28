import { useRef } from 'react';
import { useDialogBehaviour } from '../lib/useDialogBehaviour';

/**
 * The keyboard and focus behaviour every modal needs, without touching its markup.
 * Ported from pos-react.
 *
 * Renders nothing and attaches Escape-to-close, a Tab trap and focus return to its
 * closest `[role="dialog"]` ancestor — so a hand-built dialog adopts it with one line.
 * `Sheet` uses the same hook, so dialogs built on it get this by construction.
 */
export function DialogBehaviour({
  onClose,
  busy = false,
}: {
  /** Escape and backdrop clicks call this. */
  onClose: () => void;
  /** While true, closing is ignored — a save in flight must not be abandoned halfway. */
  busy?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);

  useDialogBehaviour(
    () => anchor.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
    onClose,
    busy,
  );

  // A zero-size anchor rather than a ref on the dialog itself, which would mean editing
  // the element this exists to leave alone.
  return <span ref={anchor} hidden aria-hidden="true" />;
}
