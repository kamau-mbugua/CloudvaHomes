import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useDialogBehaviour } from '../lib/useDialogBehaviour';

/**
 * Renders a list page and an `<Outlet />` so child detail/form routes open in a
 * right-side slide-over drawer over the list instead of replacing the page.
 */
export function WithRouteDrawer({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Outlet />
    </>
  );
}

/**
 * A right-side slide-over drawer bound to a route. Closing (Escape, backdrop click, or ×)
 * navigates back to `backTo`.
 */
export function RouteDrawer({
  title,
  backTo,
  children,
}: {
  title: string;
  backTo: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const backdrop = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    navigate(backTo);
  }, [navigate, backTo]);

  useDialogBehaviour(() => backdrop.current, close, false);

  return createPortal(
    <div
      ref={backdrop}
      className="nx-sheet nx-sheet--route"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="nx-sheet__panel nx-sheet__panel--xl">
        <header className="nx-sheet__head">
          <h2>{title}</h2>
          <button
            type="button"
            className="nx-sheet__x"
            aria-label="Close"
            onClick={close}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
