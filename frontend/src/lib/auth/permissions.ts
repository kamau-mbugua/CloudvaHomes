import type { Session } from './types';

/**
 * Whether the session may do `permission`. `undefined` means "anyone signed in with an
 * organisation" (the dashboard, the account page).
 *
 * This only hides UI. The server checks every request and is the authority.
 */
export function hasPermission(session: Pick<Session, 'permissions'> | null, permission: string | undefined): boolean {
  if (!session) return false;
  if (!permission) return true;
  return session.permissions.includes(permission);
}

/** "Grace Wanjiku", or the email/phone when a name is missing. */
export function displayName(person: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null }): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || person.email || person.phone || 'Unnamed';
}
