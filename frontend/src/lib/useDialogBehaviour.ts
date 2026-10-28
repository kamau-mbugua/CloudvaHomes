import { useEffect, useRef } from 'react';

/**
 * Escape to close, Tab trapped inside, focus moved in on open and returned on close.
 * Ported from pos-react.
 *
 * `resolve` is a function rather than a ref so both callers can use it: `Sheet` owns its
 * panel directly, while `DialogBehaviour` has to find it by walking up the tree.
 */
export function useDialogBehaviour(
  resolve: () => HTMLElement | null,
  onClose: () => void,
  busy: boolean,
) {
  const opener = useRef<Element | null>(null);
  const latest = useRef({ onClose, busy });

  // Kept in a ref so the listener is attached once. Re-attaching on every render would
  // re-run the focus-on-open effect and yank the cursor back to the first field while
  // someone is typing.
  latest.current = { onClose, busy };

  useEffect(() => {
    const dialog = resolve();

    opener.current = document.activeElement;

    // The first control, not the dialog itself: landing on the container means the next
    // Tab starts from the top again, which reads as focus having gone nowhere.
    dialog?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]',
    )?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const panel = resolve();

      if (!panel) return;

      if (event.key === 'Escape') {
        // Stopped so it does not also close a dialog further out, or clear a filter
        // behind this one.
        event.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Wrapping at both ends is what keeps focus inside without having to hide the rest
      // of the page from assistive technology.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      const panel = resolve();

      // Only a press that BEGAN on the backdrop counts. A drag that starts inside —
      // selecting text, moving a slider — and ends outside is still work in progress.
      if (panel && event.target === panel && !latest.current.busy) {
        latest.current.onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    dialog?.addEventListener('mousedown', onMouseDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      dialog?.removeEventListener('mousedown', onMouseDown);

      // Only if focus is still inside: something else may have deliberately claimed it
      // while this was closing.
      if (opener.current instanceof HTMLElement
        && (!document.activeElement
          || document.activeElement === document.body
          || dialog?.contains(document.activeElement))) {
        opener.current.focus();
      }
    };
    // Deliberately once per mount. `resolve` is stable in both callers, and re-running
    // this would re-focus the first field mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
