import { useState } from 'react';
import { errorMessage } from '../lib/api/client';
import { propertySwitchRequest, scopedProperty } from '../lib/auth/propertyScope';
import { switchContext } from '../lib/auth/session';
import { useSession } from '../lib/auth/useAuth';
import { useToast } from '../lib/useToast';

/**
 * Shown under the top bar on every staff page while the app is narrowed to one property, so
 * tenants, invoices and figures from the other properties never just seem to be missing.
 */
export function PropertyScopeBanner() {
  const session = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const property = session ? scopedProperty(session) : null;
  if (!property) return null;

  const showAll = async () => {
    setBusy(true);
    try {
      await switchContext(propertySwitchRequest(null));
      toast.saved('Showing all properties.');
    } catch (caught) {
      toast.failed(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hb__banner hb__banner--scope" role="region" aria-label="Property filter">
      <p className="hb__bannertext">
        Showing only <strong>{property.name}</strong> <span className="code">({property.code})</span>
        {' '}— your other properties are hidden on every page.
      </p>
      <div className="hb__banneractions">
        <button type="button" className="nx-btn nx-btn--sm" disabled={busy} onClick={() => void showAll()}>
          {busy ? 'Switching…' : 'Show all properties'}
        </button>
      </div>
    </div>
  );
}
