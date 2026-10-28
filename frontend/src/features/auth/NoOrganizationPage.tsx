import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './authErrors';
import { logout, switchOrganization } from '../../lib/auth/session';
import { displayName } from '../../lib/auth/permissions';
import type { Session } from '../../lib/auth/types';

/**
 * Signed in, but not inside any organisation.
 *
 * Usually an account whose memberships were all removed. (Platform admins without an
 * organisation go to the admin area instead.) If memberships exist but none is active,
 * offer them instead.
 */
export function NoOrganizationPage({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setBusy('signout');
    await logout();
    navigate('/login', { replace: true });
  };

  const choose = async (organizationId: string) => {
    setBusy(organizationId);
    setError(null);
    try {
      await switchOrganization(organizationId);
      navigate('/app', { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const hasOrgs = session.organizations.length > 0;

  return (
    <AuthLayout>
      <div className="au__form au__step">
        {hasOrgs ? (
          <>
            <h1>Choose an organisation</h1>
            <p className="au__lede">You belong to more than one. Pick where to work now; you can switch later from the account menu.</p>
            <div className="orgpick">
              {session.organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  className="orgpick__row"
                  disabled={busy !== null}
                  onClick={() => choose(org.id)}
                >
                  <strong>{org.name}</strong>
                  <span>{org.roleName}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>Your account isn’t linked to an organisation yet</h1>
            <p className="au__lede">
              Signed in as {displayName(session.user)}. Ask the organisation that uses Hodi to invite
              you — the invitation link signs you straight in.
            </p>

          </>
        )}

        {session.user.isPlatformAdmin ? (
          <Link className="au__submit" to="/admin">Open the platform admin area</Link>
        ) : null}
        {session.ownerOf.length > 0 ? (
          <Link className="au__submit" to="/owner">Open the owner portal</Link>
        ) : null}
        {session.tenantOf.length > 0 ? (
          <Link className="au__submit" to="/tenant">Open the tenant portal</Link>
        ) : null}

        {error ? <p className="au__error" role="alert">{error}</p> : null}

        <button className="au__submit au__submit--quiet" type="button" onClick={signOut} disabled={busy !== null}>
          {busy === 'signout' ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </AuthLayout>
  );
}
