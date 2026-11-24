import { Navigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api/client';
import { homeFor } from '../../lib/auth/lastPlace';
import { logout } from '../../lib/auth/session';
import { loginPath } from '../../lib/auth/next';
import { useAuthState } from '../../lib/auth/useAuth';
import { Splash } from '../../components/Splash';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { unwrapList } from '../payments/rules';


interface DeviceSession {
  id: string;
  device: string;
  ip: string | null;
  signedInAt: string;
  lastActiveAt: string;
  current: boolean;
}

/**
 * "Your devices" (phase 26): where this account is signed in, with a sign-out per device. KodiHQ
 * also emails (or texts) the person when a device it hasn't seen signs in.
 */
export function DevicesSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: () => api.get<unknown>('/me/sessions').then((b) => unwrapList<DeviceSession>(b)),
  });
  const end = useMutation({
    mutationFn: (s: DeviceSession) => api.delete(`/me/sessions/${encodeURIComponent(s.id)}`),
    onSuccess: async (_r, s) => {
      if (s.current) {
        await logout();
        window.location.assign('/login');
        return;
      }
      toast.saved(`${s.device} was signed out.`);
      await queryClient.invalidateQueries({ queryKey: ['me', 'sessions'] });
    },
    onError: (error) => toast.failed(errorMessage(error)),
  });

  return (
    <section className="fm__section" aria-label="Your devices">
      <h2>Your devices</h2>
      <p>Where your account is signed in. Sign out anything you don’t recognise, then change your password.</p>
      {list.isError ? <p className="ad__error" role="alert">{errorMessage(list.error)}</p> : null}
      {list.isPending ? <p className="ad__muted">Loading…</p> : null}
      <ul className="tp__rows">
        {(list.data ?? []).map((s) => (
          <li key={s.id} className="tp__row">
            <span className="tp__rowmain">
              <strong>{s.device}{s.current ? ' · this device' : ''}</strong>
              <span className="ad__sub">
                Signed in {formatDateTime(s.signedInAt)} · last active {formatDateTime(s.lastActiveAt)}
                {s.ip ? ` · ${s.ip}` : ''}
              </span>
            </span>
            <ConfirmDelete label="Sign out" verb="Sign out" what={s.current ? 'this device' : s.device} busy={end.isPending}
              consequence={s.current ? 'You’ll need to sign in again here.' : 'That device will need to sign in again.'}
              onConfirm={() => end.mutate(s)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `/account` (from emails): the signed-in person's own account page, whichever area they use. */
export function AccountRedirect() {
  const { status, session } = useAuthState();
  const { pathname, search } = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut' || !session) return <Navigate to={loginPath(`${pathname}${search}`)} replace />;
  const home = homeFor(session);
  const to = home === '/admin' ? '/admin/account' : home === '/tenant' ? '/tenant/profile' : '/app/account';
  return <Navigate to={`${to}${search}`} replace />;
}
