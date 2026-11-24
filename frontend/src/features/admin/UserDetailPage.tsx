import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { isSuperAdmin } from '../../lib/auth/portals';
import { useSession } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { unwrap } from '../payments/rules';
import { Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { keys, platformErrorMessage } from '../platform/api';
import { passwordText, purgeText, userName, userState } from '../platform/rules';
import type { PlatformUserDetail } from '../platform/types';
import { UserStateBadge } from './UsersPage';

const userPath = (id: string) => `/platform/users/${encodeURIComponent(id)}`;

/**
 * Admin → People → a person (`/admin/users/:userId`): their sign-in details, the organisations
 * they work for, the homes they rent and the landlord records they can see; and support's
 * actions: edit name and contact, reset the password (a temporary one by email and SMS), sign
 * out everywhere, disable or enable; for superadmins, close the account and, once deleted,
 * restore it or erase it now. Changing sign-in details, resetting, closing and erasing ask for a
 * one-time code first. A salesperson can only look at someone who also belongs to an
 * organisation they don't look after.
 */
export function UserDetailPage() {
  const { userId = '' } = useParams();
  const user = useQuery({
    queryKey: [...keys.users, 'detail', userId],
    queryFn: () => api.get<unknown>(userPath(userId)).then((body) => unwrap<PlatformUserDetail>(body)),
  });
  if (user.isPending) return <CardSkeleton count={3} />;
  if (user.isError) {
    return (
      <div className="ph">
        <EmptyState title="Person not available" detail={platformErrorMessage(user.error)} />
      </div>
    );
  }
  return <UserDetail user={user.data} />;
}

function UserDetail({ user }: { user: PlatformUserDetail }) {
  const { user: me } = useSession();
  const superAdmin = isSuperAdmin(me);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState<'edit' | 'close' | null>(null);
  const state = userState(user);
  const live = state === 'active' || state === 'disabled';
  const name = userName(user);

  const act = useMutation({
    mutationFn: async (action: 'disable' | 'enable' | 'sign-out' | 'reset' | 'restore' | 'purge') => {
      const base = userPath(user.id);
      if (action === 'disable' || action === 'enable') {
        return api.post<unknown>(`${base}/status`, { status: action === 'disable' ? 'DISABLED' : 'ACTIVE' });
      }
      if (action === 'reset') return api.post<unknown>(`${base}/reset-password`, {});
      return api.post<unknown>(`${base}/${action}`, {});
    },
    onSuccess: async (body, action) => {
      const messages: Record<typeof action, string> = {
        disable: `${name} can no longer sign in, and was signed out everywhere.`,
        enable: `${name} can sign in again.`,
        'sign-out': `${name} was signed out everywhere.`,
        reset: `A temporary password was sent to ${[user.email, user.phone].filter(Boolean).join(' and ')}.`,
        restore: `${name}’s account was restored. Reset the password so they can sign in with one.`,
        purge: 'The account was erased.',
      };
      if (action === 'reset' && !(unwrap<{ delivered: boolean }>(body)).delivered) {
        toast.failed('The password was reset, but the message couldn’t be sent. Try again shortly.');
      } else {
        toast.saved(messages[action]);
      }
      await queryClient.invalidateQueries({ queryKey: keys.users });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });
  const busy = act.isPending;

  return (
    <div className="pg">
      <Breadcrumbs trail={[{ label: 'People', to: '/admin/users' }, { label: name }]} />
      <div className="adm__head">
        <div>
          <h1 className="adm__h1">{name}</h1>
          <span className="ad__muted">Customer account · joined {formatDateTime(user.createdAt)}</span>
        </div>
        <UserStateBadge user={user} />
        {user.canManage ? (
          <div className="pg-actions pg-push">
            {live ? (
              <>
                <button type="button" className="nx-btn" disabled={busy} onClick={() => setSheet('edit')}>Edit</button>
                <button type="button" className="nx-btn" disabled={busy || (!user.email && !user.phone)} onClick={() => act.mutate('reset')}>
                  Reset password
                </button>
                <button type="button" className="nx-btn" disabled={busy || user.activeSessions === 0} onClick={() => act.mutate('sign-out')}>
                  Sign out everywhere
                </button>
                {state === 'disabled' ? (
                  <button type="button" className="nx-btn nx-btn--primary" disabled={busy} onClick={() => act.mutate('enable')}>Enable</button>
                ) : (
                  <ConfirmDelete size="md" label="Disable" verb="Disable" what={name} busy={busy}
                    consequence="They can’t sign in until you enable the account again, and every session ends now. Their organisations’ records are unchanged."
                    onConfirm={() => act.mutate('disable')} />
                )}
                {superAdmin ? (
                  <button type="button" className="nx-btn nx-btn--danger" disabled={busy} onClick={() => setSheet('close')}>Close account</button>
                ) : null}
              </>
            ) : state === 'deleted' && superAdmin ? (
              <>
                <button type="button" className="nx-btn nx-btn--primary" disabled={busy} onClick={() => act.mutate('restore')}>Restore</button>
                <ConfirmDelete size="md" label="Erase now" verb="Erase" what="this account’s kept details" busy={busy}
                  consequence="The name, the old email and phone, sessions, codes and in-app notifications go now instead of after 30 days. It can’t be restored afterwards. Records organisations keep (payments, receipts) stay."
                  onConfirm={() => act.mutate('purge')} />
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {!user.canManage ? (
        <p className="ad__muted">This person also belongs to organisations you don’t look after, so only a superadmin can change their account.</p>
      ) : null}

      <dl className="pf__facts adm__facts">
        {user.deleted ? (
          <>
            <Fact label="Deleted">{formatDateTime(user.deleted.deletedAt)}</Fact>
            <Fact label="Email it had">{user.deleted.email}</Fact>
            <Fact label="Phone it had">{user.deleted.phone}</Fact>
            <Fact label="Reason">{user.deleted.reason}</Fact>
            <Fact label="Erased">
              {user.deleted.purgedAt ? formatDateTime(user.deleted.purgedAt) : purgeText(user.deleted.purgeOn)}
            </Fact>
          </>
        ) : (
          <>
            <Fact label="Email">{user.email}</Fact>
            <Fact label="Phone">{user.phone}</Fact>
            <Fact label="Password">{passwordText(user)}</Fact>
            <Fact label="Last sign-in">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</Fact>
            <Fact label="Signed in on">
              <span className="num">{user.activeSessions}</span> {user.activeSessions === 1 ? 'device' : 'devices'}
            </Fact>
          </>
        )}
      </dl>

      <h2 className="adm__h2">Organisations</h2>
      {user.memberships.length === 0 ? (
        <p className="ad__muted">Not on any organisation’s team.</p>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr><th>Organisation</th><th>Role</th><th>Membership</th><th>Since</th></tr>
            </thead>
            <tbody>
              {user.memberships.map((m) => (
                <tr key={m.id}>
                  <td><Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(m.organization.id)}?tab=team`}>{m.organization.name}</Link></td>
                  <td>{m.role.name}</td>
                  <td>{m.status === 'ACTIVE' ? 'Active' : m.status === 'INVITED' ? 'Invited' : 'Ended'}</td>
                  <td>{formatDateTime(m.joinedAt ?? m.invitedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {user.tenants.length > 0 ? (
        <>
          <h2 className="adm__h2">Rents from</h2>
          <ul className="ad__list">
            {user.tenants.map((t) => (
              <li key={t.id}>
                <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(t.organization.id)}`}>{t.organization.name}</Link>
                <span className="ad__muted"> · tenant {t.name} (<span className="num">{t.code}</span>)</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {user.landlords.length > 0 ? (
        <>
          <h2 className="adm__h2">Landlord of</h2>
          <ul className="ad__list">
            {user.landlords.map((l) => (
              <li key={l.id}>
                <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(l.organization.id)}`}>{l.organization.name}</Link>
                <span className="ad__muted"> · owner-portal access as {l.name}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {sheet === 'edit' ? <EditUserSheet user={user} onClose={() => setSheet(null)} /> : null}
      {sheet === 'close' ? <CloseAccountSheet user={user} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function EditUserSheet({ user, onClose }: { user: PlatformUserDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<unknown>(userPath(user.id), body),
    onSuccess: async () => {
      toast.saved(`${firstName.trim()} ${lastName.trim()} updated.`);
      await queryClient.invalidateQueries({ queryKey: keys.users });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        return;
      }
      setGeneral(platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Enter a first name.';
    if (!lastName.trim()) next.lastName = 'Enter a last name.';
    if (email.trim() && !email.includes('@')) next.email = 'Enter a valid email address.';
    if (!email.trim() && !phone.trim()) next.email = 'Keep an email address or a phone number.';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
    });
  };

  const signInChanging =
    email.trim().toLowerCase() !== (user.email ?? '').toLowerCase() || phone.trim() !== (user.phone ?? '');

  return (
    <Sheet
      title={`Edit ${userName(user)}`}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="user-edit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      )}
    >
      <form id="user-edit" className="sheet-form" onSubmit={submit} noValidate>
        <div className="fm__grid sheet-grid">
          <Field id="user-edit-first" label="First name" error={errors.firstName}>
            <input id="user-edit-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field id="user-edit-last" label="Last name" error={errors.lastName}>
            <input id="user-edit-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field id="user-edit-email" label="Email" optional error={errors.email}>
            <input id="user-edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="user-edit-phone" label="Phone" optional error={errors.phone}>
            <input id="user-edit-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        {signInChanging ? (
          <p className="ad__muted">
            These are what they sign in with. Saving asks you for a one-time code, and signs {user.firstName} out everywhere.
          </p>
        ) : null}
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

function CloseAccountSheet({ user, onClose }: { user: PlatformUserDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [general, setGeneral] = useState<string | null>(null);

  const close = useMutation({
    mutationFn: () => api.post<unknown>(`${userPath(user.id)}/close`, { reason: reason.trim() || undefined }),
    onSuccess: async () => {
      toast.saved(`${userName(user)}’s account was closed. It can be restored for 30 days.`);
      await queryClient.invalidateQueries({ queryKey: keys.users });
      onClose();
    },
    onError: (error) => setGeneral(platformErrorMessage(error)),
  });

  return (
    <Sheet
      title={`Close ${userName(user)}’s account`}
      busy={close.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={close.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--danger" disabled={close.isPending} onClick={() => { setGeneral(null); close.mutate(); }}>
            {close.isPending ? 'Closing…' : 'Close account'}
          </button>
        </>
      )}
    >
      <div className="sheet-form">
        <p>
          For someone who asked KodiHQ to delete their account (for example by email to privacy@cloudvalabs.com) and
          can’t do it in the app. It works like deleting it themselves:
        </p>
        <ul className="ad__list">
          <li>Their sign-in email, phone and password are removed, and every session ends now.</li>
          <li>They leave every organisation’s team; tenant and landlord records stay with the organisations.</li>
          <li>The rest is erased after 30 days. Until then you can restore it.</li>
        </ul>
        <Field id="close-reason" label="Reason" optional hint="For example: “Emailed privacy@ on 24 Nov”.">
          <textarea id="close-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="ad__muted">You’ll be asked for a one-time code.</p>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </div>
    </Sheet>
  );
}
