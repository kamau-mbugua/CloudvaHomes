import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';
import { errorMessage } from '../lib/api/client';
import { displayName } from '../lib/auth/permissions';
import { menuPlaces, type MenuHere } from '../lib/auth/portals';
import { logout, switchOrganization } from '../lib/auth/session';
import { useSession } from '../lib/auth/useAuth';
import { useToast } from '../lib/useToast';

/**
 * The account menu, wired to the session — the same menu in the staff app, the admin area and
 * both portals, so a person can always reach every place they have: their organisations, the
 * owner and tenant portals, and (for operators) the admin area or sales console.
 */
export function SessionAccountMenu({
  here,
  role,
  accountPath,
}: {
  here: MenuHere;
  role: string | null;
  /** Where "My account" goes; null hides it (the owner portal has no profile page). */
  accountPath: string | null;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const offer = menuPlaces(session, here);
  // In a portal no organisation is "the one you're in": each row opens the staff app in it.
  const activeId = here === 'staff' || here === 'admin' ? (session.activeOrganization?.id ?? null) : null;

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const switchTo = async (organizationId: string) => {
    if (organizationId === session.activeOrganization?.id) {
      navigate('/app');
      return;
    }
    setSwitchingTo(organizationId);
    try {
      const next = await switchOrganization(organizationId);
      navigate('/app', { replace: here === 'staff' });
      toast.saved(`Switched to ${next.activeOrganization?.name ?? 'the organisation'}.`);
    } catch (caught) {
      toast.failed(errorMessage(caught));
    } finally {
      setSwitchingTo(null);
    }
  };

  return (
    <AccountMenu
      name={displayName(session.user)}
      contact={session.user.email ?? session.user.phone}
      role={role}
      organizations={offer.organizations === 'none' ? [] : session.organizations}
      listOrganizations={offer.organizations === 'all' || session.organizations.length > 1}
      activeOrganizationId={activeId}
      switchingTo={switchingTo}
      onSwitch={(id) => void switchTo(id)}
      onSignOut={() => void signOut()}
      staffApp={offer.staffApp}
      ownerPortal={offer.ownerPortal}
      tenantPortal={offer.tenantPortal}
      platformAdmin={offer.platform !== null}
      platformLabel={offer.platform ?? undefined}
      accountPath={accountPath}
    />
  );
}
