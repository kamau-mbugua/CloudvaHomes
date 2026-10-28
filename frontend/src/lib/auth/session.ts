import { configureAuth, request, setAccessToken, setStepUpGrant } from '../api/client';
import type { DataEnvelope } from '../api/types';
import { queryClient } from '../api/queryClient';
import { singleFlight } from '../singleFlight';
import type { AuthState, Session, SessionPayload } from './types';

/**
 * The signed-in session — a small external store (read with `useSyncExternalStore`, see
 * useAuth.ts) rather than React state, because the API client has to update it from
 * outside React: a refresh triggered by any request, or a refresh that failed.
 *
 * The access token goes to the API client's memory; this store holds only who is signed
 * in, where, and with which permissions. Nothing here is persisted.
 */

let state: AuthState = { status: 'loading', session: null };
const listeners = new Set<() => void>();

function setState(next: AuthState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Splits a session payload: credentials to the client, the rest to state. */
export function toSession(payload: SessionPayload): Session {
  return {
    user: payload.user,
    organizations: payload.organizations ?? [],
    activeOrganization: payload.activeOrganization ?? null,
    permissions: payload.permissions ?? [],
    ownerOf: Array.isArray(payload.ownerOf) ? payload.ownerOf : [],
    tenantOf: Array.isArray(payload.tenantOf) ? payload.tenantOf : [],
  };
}

/** Accept a session from login, OTP verify, refresh, switch-org or invitation accept. */
export function acceptSession(payload: SessionPayload): Session {
  if (payload.accessToken) setAccessToken(payload.accessToken);
  const session = toSession(payload);
  setState({ status: 'signedIn', session });
  return session;
}

/** Replace the session details (e.g. after `GET /me`) without touching credentials. */
export function updateSessionDetails(payload: SessionPayload): void {
  if (state.status !== 'signedIn') return;
  setState({ status: 'signedIn', session: toSession(payload) });
}

/**
 * Re-read the session (`GET /me`) — e.g. when the organisation's Hodi status changed
 * (paid, or a change was refused as suspended), so the billing banner catches up.
 * Single-flight; a failure leaves the session as it was.
 */
export const reloadSessionDetails = singleFlight(async (): Promise<void> => {
  try {
    const me = await request<DataEnvelope<SessionPayload>>('/me');
    updateSessionDetails(me.data);
  } catch {
    // It catches up on the next refresh.
  }
});

/** Forget everything locally: token, step-up grant, cached server data. */
export function clearSession(): void {
  setAccessToken(null);
  setStepUpGrant(null);
  queryClient.clear();
  setState({ status: 'signedOut', session: null });
}

/**
 * Rotate the refresh cookie for a new access token. Single-flight: the app's start-up
 * restore, StrictMode's double effect and any number of expired requests all share ONE
 * call — a second concurrent refresh would present an already-rotated token, which the
 * server treats as theft and answers by revoking the whole session family.
 */
export const refreshSession = singleFlight(async (): Promise<Session> => {
  const result = await request<DataEnvelope<SessionPayload>>('/auth/refresh', {
    method: 'POST',
    body: {},
    skipAuthRetry: true,
  });
  return acceptSession(result.data);
});

/** On app load: a valid refresh cookie means the person is still signed in. */
export async function restoreSession(): Promise<void> {
  if (state.status !== 'loading') return;
  try {
    await refreshSession();
  } catch {
    // No cookie, an expired one, or no server: all mean "sign in".
    if (state.status === 'loading') setState({ status: 'signedOut', session: null });
  }
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST', skipAuthRetry: true });
  } catch {
    // Signing out locally still happens; the server session expires on its own.
  } finally {
    clearSession();
  }
}

/** Switch to another membership. Cached data belongs to the old organisation, so it goes. */
export async function switchOrganization(organizationId: string): Promise<Session> {
  const result = await request<DataEnvelope<SessionPayload>>('/auth/switch-org', {
    method: 'POST',
    body: { organizationId },
  });
  setStepUpGrant(null);
  queryClient.clear();
  return acceptSession(result.data);
}

configureAuth({
  refresh: async () => {
    await refreshSession();
    return true;
  },
  onAuthLost: clearSession,
});
