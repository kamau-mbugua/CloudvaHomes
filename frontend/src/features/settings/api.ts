import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import type { PermissionGroup, Role } from '../../lib/auth/types';

/**
 * Query keys and shared reads for the settings screens. Keys start with the resource, so
 * `invalidateQueries({ queryKey: ['users'] })` refreshes every page and filter of it.
 */
export const keys = {
  organization: ['organization'] as const,
  users: ['users'] as const,
  roles: ['roles'] as const,
  role: (id: string) => ['roles', id] as const,
  permissions: ['permissions'] as const,
  audit: ['audit-logs'] as const,
};

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: keys.roles,
    queryFn: () => api.get<DataEnvelope<Role[]>>('/roles').then((r) => r.data),
    enabled,
  });
}

export function usePermissionCatalogue() {
  return useQuery({
    queryKey: keys.permissions,
    queryFn: () => api.get<DataEnvelope<PermissionGroup[]>>('/permissions').then((r) => r.data),
    staleTime: Infinity,
  });
}

/**
 * Messages for the identity error codes a settings screen can meet. The server's own
 * message is the fallback, so a new code still reads sensibly.
 */
export function settingsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'LAST_OWNER':
        return 'Every organisation needs at least one active Owner. Make someone else an Owner first.';
      case 'ALREADY_MEMBER':
        return 'That person is already a member of this organisation.';
      case 'ROLE_IN_USE':
        return 'People still have this role. Move them to another role first, then delete it.';
      case 'PERMISSION_DENIED':
        return 'Your role does not allow this change.';
      case 'STEP_UP_REQUIRED':
        return 'The change was not made: it needs the confirmation code.';
      default:
        return error.requestId && error.status >= 500 ? `${error.message} (ref ${error.requestId})` : error.message;
    }
  }
  return 'Something went wrong. Try again.';
}
