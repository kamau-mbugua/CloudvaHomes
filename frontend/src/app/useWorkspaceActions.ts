import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../lib/api/client';
import type { MenuHere } from '../lib/auth/portals';
import { acceptInvitation, switchContext } from '../lib/auth/session';
import { useToast } from '../lib/useToast';
import { rowKey, type PendingInvite, type WorkspaceRow } from './workspaces';

/**
 * Shared switching and invitation-accept behaviour for both `WorkspaceSwitcher`
 * and the admin area's profile menu.
 */
export function useWorkspaceActions(here: MenuHere, onChosen?: () => void) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);

  const chooseRow = useCallback(
    async (row: WorkspaceRow, closeMenu?: () => void) => {
      if (row.kind === 'invited') {
        closeMenu?.();
        setPendingInvite(row);
        return;
      }

      if (row.current) {
        closeMenu?.();
        onChosen?.();
        return;
      }

      const key = rowKey(row);
      setBusyKey(key);
      try {
        if (row.kind === 'org') {
          await switchContext({ organizationId: row.id, place: 'STAFF' });
          closeMenu?.();
          onChosen?.();
          navigate('/app', { replace: here === 'staff' });
          toast.saved(`Switched to ${row.name}.`);
        } else if (row.kind === 'home') {
          await switchContext({ tenantId: row.tenantId, homeId: row.homeId, place: 'TENANT' });
          closeMenu?.();
          onChosen?.();
          navigate('/tenant', { replace: here === 'tenant' });
          toast.saved(`Switched to ${row.name}.`);
        } else if (row.kind === 'all-homes') {
          await switchContext({ tenantId: null, homeId: null, place: 'TENANT' });
          closeMenu?.();
          onChosen?.();
          navigate('/tenant', { replace: here === 'tenant' });
          toast.saved(`Switched to ${row.name}.`);
        } else if (row.kind === 'landlord') {
          await switchContext({ landlordId: row.landlordId, place: 'OWNER' });
          closeMenu?.();
          onChosen?.();
          navigate(`/owner?landlord=${encodeURIComponent(row.landlordId)}`, {
            replace: here === 'owner',
          });
          toast.saved(`Switched to ${row.name}.`);
        }
      } catch (caught) {
        toast.failed(errorMessage(caught));
      } finally {
        setBusyKey(null);
      }
    },
    [here, navigate, onChosen, toast],
  );

  const confirmInvite = useCallback(async () => {
    if (!pendingInvite) return;
    const invite = pendingInvite;
    setBusyKey(rowKey(invite));
    try {
      await acceptInvitation(invite.membershipId);
      setPendingInvite(null);
      onChosen?.();
      navigate('/app');
      toast.saved(`You joined ${invite.name}.`);
    } catch (caught) {
      toast.failed(errorMessage(caught));
    } finally {
      setBusyKey(null);
    }
  }, [navigate, onChosen, pendingInvite, toast]);

  return {
    busyKey,
    pendingInvite,
    setPendingInvite,
    chooseRow,
    confirmInvite,
  };
}
