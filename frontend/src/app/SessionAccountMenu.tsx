import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';
import { InviteJoinSheet } from './WorkspaceSwitcher';
import { useWorkspaceActions } from './useWorkspaceActions';
import { rowKey, workspaceList } from './workspaces';
import { errorMessage } from '../lib/api/client';
import { clearPriorPlace, getPriorPlace, notePriorPlace, setPlace } from '../lib/auth/lastPlace';
import { displayName } from '../lib/auth/permissions';
import { menuPlaces, type MenuHere } from '../lib/auth/portals';
import { logout, switchContext } from '../lib/auth/session';
import { useSession } from '../lib/auth/useAuth';
import { useToast } from '../lib/useToast';

/**
 * The profile menu, wired to the session across all four shells:
 * - Everywhere outside `/admin`: Appearance, "Sales console" / "Platform admin" (for
 *   operators), My account, Sign out.
 * - In `/admin` (which has no sidebar switcher): "Back to <name>" plus the same grouped
 *   workspace list as the switcher.
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
  const [navBusy, setNavBusy] = useState(false);
  const offer = menuPlaces(session, here, getPriorPlace());
  const groups = useMemo(
    () => (offer.list ? workspaceList(session, 'admin') : []),
    [offer.list, session],
  );
  const { busyKey, pendingInvite, setPendingInvite, chooseRow, confirmInvite } =
    useWorkspaceActions(here);

  const signOut = async () => {
    clearPriorPlace();
    await logout();
    navigate('/login', { replace: true });
  };

  const openPlatform = async () => {
    setNavBusy(true);
    try {
      notePriorPlace(here);
      await setPlace('PLATFORM');
      navigate('/admin');
    } catch (caught) {
      toast.failed(errorMessage(caught));
    } finally {
      setNavBusy(false);
    }
  };

  const openBackTo = async () => {
    const target = offer.backTo;
    if (!target) return;
    setNavBusy(true);
    try {
      if (target.place === 'STAFF') {
        await switchContext({ organizationId: target.organizationId, place: 'STAFF' });
      } else if (target.place === 'TENANT') {
        await switchContext({ tenantId: target.tenantId, homeId: target.homeId, place: 'TENANT' });
      } else {
        await switchContext({ landlordId: target.landlordId, place: 'OWNER' });
      }
      navigate(target.to);
    } catch (caught) {
      toast.failed(errorMessage(caught));
    } finally {
      setNavBusy(false);
    }
  };

  return (
    <>
      <AccountMenu
        name={displayName(session.user)}
        contact={session.user.email ?? session.user.phone}
        role={role}
        busy={navBusy || busyKey !== null}
        busyKey={busyKey}
        platformLabel={offer.platform}
        onOpenPlatform={() => void openPlatform()}
        backToLabel={offer.backTo?.label ?? null}
        onBackTo={() => void openBackTo()}
        workspaceGroups={groups}
        onChooseWorkspace={(row, close) => void chooseRow(row, close)}
        onSignOut={() => void signOut()}
        accountPath={accountPath}
      />

      <InviteJoinSheet
        invite={pendingInvite}
        busy={pendingInvite !== null && busyKey === rowKey(pendingInvite)}
        onClose={() => setPendingInvite(null)}
        onConfirm={() => void confirmInvite()}
      />
    </>
  );
}
