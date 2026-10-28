import { Link, useLocation } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ORG_NAV, bestEntry } from './navigation';

/**
 * What every `/app` screen renders until its phase builds it. Reads the page's entry from
 * the navigation model, so routes need no per-page component yet.
 */
export function PlaceholderPage() {
  const location = useLocation();
  const here = bestEntry(ORG_NAV, location.pathname);

  if (!here) return <NotFoundPage />;

  return (
    <div className="ph">
      <EmptyState
        badge={`Coming in phase ${here.entry.phase}`}
        title={here.entry.label}
        detail={`${here.entry.hint}. This screen is part of the plan but not built yet.`}
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="ph">
      <EmptyState
        title="Page not found"
        detail="There is nothing at this address. Use the menu, or press ⌘K / Ctrl+K to jump to a page."
        action={<Link className="nx-btn nx-btn--sm" to="/app">Go to the dashboard</Link>}
      />
    </div>
  );
}
