import { useSyncExternalStore } from 'react';
import { getAuthState, subscribeAuth } from './session';
import { hasPermission } from './permissions';
import type { AuthState, Session } from './types';

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}

/**
 * The signed-in session. Only for components rendered inside `RequireAuth`, which does
 * not render its children without one.
 */
export function useSession(): Session {
  const { session } = useAuthState();
  if (!session) throw new Error('useSession() used outside RequireAuth');
  return session;
}

/** Whether the current session holds `permission` (undefined = anyone signed in). */
export function useCan(permission: string | undefined): boolean {
  const { session } = useAuthState();
  return hasPermission(session, permission);
}
