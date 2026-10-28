import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { logout } from '../../lib/auth/session';
import { displayName } from '../../lib/auth/permissions';
import type { Session } from '../../lib/auth/types';

/**
 * Signed in without an organisation, but both a landlord of an agency (`ownerOf`) and a
 * tenant (`tenantOf`): two portals, so ask which. Each portal links to the other.
 */
export function PortalChooserPage({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  const names = (list: { organization: { name: string } }[]) => [...new Set(list.map((x) => x.organization.name))].join(', ');

  return (
    <AuthLayout>
      <div className="au__form au__step">
        <h1>Where would you like to go?</h1>
        <p className="au__lede">Signed in as {displayName(session.user)}. You can switch later from the link at the bottom of each portal.</p>
        <div className="orgpick">
          <Link className="orgpick__row" to="/tenant">
            <strong>My home — tenant portal</strong>
            <span>What you owe, invoices, receipts and paying rent · {names(session.tenantOf)}</span>
          </Link>
          <Link className="orgpick__row" to="/owner">
            <strong>My properties — owner portal</strong>
            <span>Statements and payouts from your agency · {names(session.ownerOf)}</span>
          </Link>
        </div>
        <button className="au__submit au__submit--quiet" type="button" onClick={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </AuthLayout>
  );
}
