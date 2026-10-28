import type { ReactNode } from 'react';

/**
 * What to show when there is nothing to show. Ported from pos-react.
 *
 * Takes a line of explanation and, where there is one, the action that fills the space.
 * EMPTY and FILTERED are different: a list with nothing in it yet needs a nudge to create
 * the first thing; the same list filtered to nothing needs a way back out — pass
 * `onClear` for that case.
 */
export function EmptyState({
  badge,
  title,
  detail,
  action,
  onClear,
}: {
  /** A small label above the title, e.g. "Coming in phase 2". */
  badge?: ReactNode;
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  /** Present when the emptiness is caused by a filter rather than by having nothing. */
  onClear?: () => void;
}) {
  return (
    <div className="es">
      {badge ? <span className="es__badge">{badge}</span> : null}
      <p className="es__title">{title}</p>
      {detail ? <p className="es__detail">{detail}</p> : null}

      {onClear || action ? (
        <div className="es__actions">
          {onClear ? (
            <button type="button" className="nx-btn nx-btn--sm" onClick={onClear}>
              Clear the filters
            </button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
