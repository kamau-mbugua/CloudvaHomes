import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { displayName } from '../../lib/auth/permissions';
import type { Member, MemberStatus, Role } from '../../lib/auth/types';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { keys, settingsErrorMessage, useRoles } from './api';
import { PropertyAccessPicker } from '../portfolio/PropertyAccessPicker';
import { propertyAccessValue } from '../portfolio/access';

/**
 * Settings → Users: who can sign in to this organisation, with which role.
 *
 * Filters live in the address (q, status, roleId, page) so a filtered list survives a
 * reload and the back button. Your own row cannot be changed here — the server refuses
 * it anyway, and a disabled button explains that better than an error.
 */

const PAGE_SIZE = 20;

const STATUS: Record<MemberStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'Active', tone: 'ad__badge--ok' },
  INVITED: { label: 'Invited', tone: 'ad__badge--warn' },
  INACTIVE: { label: 'Inactive', tone: 'ad__badge--off' },
};

export function UsersPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const canInvite = useCan('users:create');
  const canUpdate = useCan('users:update');
  const canDelete = useCan('users:delete');
  // GET /roles accepts users:view (or roles:view), and this page already requires users:view.
  const canListUsers = useCan('users:view');
  const canViewRoles = useCan('roles:view');
  const canSeeRoles = canListUsers || canViewRoles;

  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const roleId = params.get('roleId') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const [inviting, setInviting] = useState(false);
  const [editingAccess, setEditingAccess] = useState<Member | null>(null);

  const setFilter = (changes: Record<string, string>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace: true });
  };

  // Typing searches after a pause, not on every keystroke.
  useEffect(() => {
    if (search.trim() === q) return undefined;
    const timer = setTimeout(() => setFilter({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const list = useQuery({
    queryKey: [...keys.users, { q, status, roleId, page }],
    queryFn: () => api.get<PageEnvelope<Member>>('/users', { page, pageSize: PAGE_SIZE, q, status, roleId }),
    placeholderData: keepPreviousData,
  });

  // Roles feed the filter and the invite/change-role pickers.
  const roles = useRoles(canSeeRoles);

  const done = (message: string) => {
    toast.saved(message);
    return queryClient.invalidateQueries({ queryKey: keys.users });
  };

  const setStatus = useMutation({
    mutationFn: ({ member, to }: { member: Member; to: MemberStatus }) =>
      api.patch(`/users/${member.userId}`, { status: to }),
    onSuccess: (_r, { member, to }) => done(`${displayName(member)} ${to === 'INACTIVE' ? 'can no longer sign in' : 'can sign in again'}.`),
    onError: (error) => toast.failed(settingsErrorMessage(error)),
  });

  const resend = useMutation({
    mutationFn: (member: Member) => api.post(`/users/${member.userId}/invitation/resend`),
    onSuccess: (_r, member) => done(`Invitation sent again to ${member.email ?? member.phone ?? displayName(member)}.`),
    onError: (error) => toast.failed(settingsErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (member: Member) => api.delete(`/users/${member.userId}`),
    onSuccess: (_r, member) => done(`${displayName(member)} was removed from the organisation.`),
    onError: (error) => toast.failed(settingsErrorMessage(error)),
  });

  const filtered = Boolean(q || status || roleId);
  const rows = list.data?.data ?? [];
  const busyId = (setStatus.isPending && setStatus.variables?.member.userId)
    || (resend.isPending && resend.variables?.userId)
    || (remove.isPending && remove.variables?.userId)
    || null;

  return (
    <div className="pg">
      <div className="ad__filters">
        <input
          className="ad__search"
          type="search"
          placeholder="Search by name, email or phone"
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INVITED">Invited</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {canSeeRoles ? (
          <select className="ad__select" aria-label="Role" value={roleId} onChange={(e) => setFilter({ roleId: e.target.value })}>
            <option value="">All roles</option>
            {(roles.data ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        ) : null}
        {canInvite ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setInviting(true)}>
            Invite user
          </button>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{settingsErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState
              title="No users match"
              detail="Try a different name, or clear the filters."
              onClear={() => { setSearch(''); setParams({}, { replace: true }); }}
            />
          ) : (
            <EmptyState title="No users yet" detail="Invite the people who work with you." />
          )}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => {
                const self = member.userId === session.user.id;
                const busy = busyId === member.userId;
                const lockedTitle = self ? 'You can’t change your own access' : undefined;

                return (
                  <tr key={member.userId}>
                    <td>
                      <strong>{displayName(member)}</strong>
                      {self ? <span className="ad__sub">You</span> : null}
                    </td>
                    <td>
                      {member.email ?? '—'}
                      {member.phone ? <span className="ad__sub num">{member.phone}</span> : null}
                    </td>
                    <td>
                      {member.role.name}
                      <span className="ad__sub">
                        {member.propertyIds.length === 0 ? 'All properties'
                          : `${member.propertyIds.length} ${member.propertyIds.length === 1 ? 'property' : 'properties'}`}
                      </span>
                    </td>
                    <td>
                      <span className={`ad__badge ${STATUS[member.status]?.tone ?? 'ad__badge--off'}`}>
                        {STATUS[member.status]?.label ?? member.status}
                      </span>
                      {member.status === 'INVITED' && member.invitedAt ? (
                        <span className="ad__sub">Invited {formatDateTime(member.invitedAt)}</span>
                      ) : null}
                    </td>
                    <td>{member.lastLoginAt ? formatDateTime(member.lastLoginAt) : <span className="ad__muted">Never</span>}</td>
                    <td className="ad__rowactions">
                      <div>
                        {canUpdate && canSeeRoles ? (
                          <button type="button" className="nx-btn nx-btn--sm" disabled={self || busy}
                            title={lockedTitle} onClick={() => setEditingAccess(member)}>
                            Edit access
                          </button>
                        ) : null}
                        {canInvite && member.status === 'INVITED' ? (
                          <button type="button" className="nx-btn nx-btn--sm" disabled={busy}
                            onClick={() => resend.mutate(member)}>
                            Resend invite
                          </button>
                        ) : null}
                        {canUpdate && member.status !== 'INVITED' ? (
                          <button type="button" className="nx-btn nx-btn--sm" disabled={self || busy} title={lockedTitle}
                            onClick={() => setStatus.mutate({ member, to: member.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' })}>
                            {member.status === 'INACTIVE' ? 'Reactivate' : 'Deactivate'}
                          </button>
                        ) : null}
                        {canDelete && !self ? (
                          <ConfirmDelete
                            label="Remove"
                            verb="Remove"
                            what={`${displayName(member)} from this organisation`}
                            consequence="They will no longer be able to sign in here. Their KodiHub account and the history of what they did stay."
                            busy={busy}
                            onConfirm={() => remove.mutate(member)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={list.data?.meta} onPage={(next) => setFilter({ page: String(next) })} />

      {inviting ? (
        <InviteUserSheet
          roles={roles.data ?? []}
          rolesError={roles.isError ? settingsErrorMessage(roles.error) : !canSeeRoles ? 'Your role cannot see the list of roles, so it cannot invite people.' : null}
          onClose={() => setInviting(false)}
          onInvited={(who) => { setInviting(false); void done(`Invitation sent to ${who}.`); }}
        />
      ) : null}

      {editingAccess ? (
        <EditAccessSheet
          member={editingAccess}
          roles={roles.data ?? []}
          onClose={() => setEditingAccess(null)}
          onChanged={(message) => { setEditingAccess(null); void done(message); }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- invite

type InviteField = 'firstName' | 'lastName' | 'email' | 'phone' | 'roleId' | 'propertyIds';

function InviteUserSheet({
  roles,
  rolesError,
  onClose,
  onInvited,
}: {
  roles: Role[];
  rolesError: string | null;
  onClose: () => void;
  onInvited: (who: string) => void;
}) {
  const [values, setValues] = useState<Record<Exclude<InviteField, 'propertyIds'>, string>>({
    firstName: '', lastName: '', email: '', phone: '', roleId: '',
  });
  const [errors, setErrors] = useState<Partial<Record<InviteField, string>>>({});
  const [limited, setLimited] = useState(false);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);

  const invite = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<DataEnvelope<Member>>('/users/invitations', body),
    onSuccess: () => onInvited(values.email.trim() || values.phone.trim()),
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(error.fieldErrors);
      if (error instanceof ApiError && error.code === 'ALREADY_MEMBER') {
        setErrors({ [values.email.trim() ? 'email' : 'phone']: 'Already a member of this organisation.' });
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<InviteField, string>> = {};
    if (!values.firstName.trim()) found.firstName = 'Required.';
    if (!values.lastName.trim()) found.lastName = 'Required.';
    if (!values.email.trim() && !values.phone.trim()) found.email = 'Give an email, a phone number, or both.';
    if (!values.roleId) found.roleId = 'Choose a role.';
    const access = propertyAccessValue(limited, propertyIds);
    if (!access.ok) found.propertyIds = access.error;
    setErrors(found);
    if (Object.keys(found).length > 0 || !access.ok) return;

    invite.mutate({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
      roleId: values.roleId,
      // Omitted for "all properties", which is the server's default.
      propertyIds: access.ids.length > 0 ? access.ids : undefined,
    });
  };

  const input = (name: Exclude<InviteField, 'propertyIds'>, label: string, props: Record<string, string | boolean> = {}) => (
    <div className={`fld ${errors[name] ? 'is-bad' : ''}`}>
      <label htmlFor={`inv-${name}`}>{label}</label>
      <input
        id={`inv-${name}`}
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        aria-invalid={Boolean(errors[name])}
        {...props}
      />
      {errors[name] ? <span className="fld__err">{errors[name]}</span> : null}
    </div>
  );

  const generalError = invite.isError
    && !(invite.error instanceof ApiError && ['VALIDATION_FAILED', 'ALREADY_MEMBER'].includes(invite.error.code))
    ? settingsErrorMessage(invite.error) : null;

  return (
    <Sheet
      title="Invite user"
      busy={invite.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={invite.isPending}>Cancel</button>
          <button type="submit" form="invite-form" className="nx-btn nx-btn--primary" disabled={invite.isPending || roles.length === 0}>
            {invite.isPending ? 'Sending…' : 'Send invitation'}
          </button>
        </>
      )}
    >
      <form id="invite-form" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">They get a link by email or SMS to set a password and join.</p>
        <div className="fm__grid sheet-grid">
          {input('firstName', 'First name', { autoComplete: 'off' })}
          {input('lastName', 'Last name', { autoComplete: 'off' })}
          {input('email', 'Email', { type: 'email', autoComplete: 'off', placeholder: 'name@example.com' })}
          {input('phone', 'Phone', { type: 'tel', inputMode: 'tel', autoComplete: 'off', placeholder: '0712 345 678' })}

          <div className={`fld fm__wide ${errors.roleId ? 'is-bad' : ''}`}>
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" value={values.roleId} onChange={(e) => setValues((v) => ({ ...v, roleId: e.target.value }))}>
              <option value="">Choose a role…</option>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
            {errors.roleId ? <span className="fld__err">{errors.roleId}</span>
              : rolesError ? <span className="fld__err">{rolesError}</span> : null}
          </div>

          <PropertyAccessPicker
            limited={limited}
            onLimitedChange={setLimited}
            value={propertyIds}
            onChange={setPropertyIds}
            error={errors.propertyIds}
            disabled={invite.isPending}
          />
        </div>

        {generalError ? <p className="nx-sheet__error" role="alert">{generalError}</p> : null}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- edit access

/** Same members, same order — order of ticking does not matter. */
function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * A member's role and the properties they are limited to. Only what changed is sent: a
 * role change needs a step-up code, a property change alone does not.
 */
function EditAccessSheet({
  member,
  roles,
  onClose,
  onChanged,
}: {
  member: Member;
  roles: Role[];
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [roleId, setRoleId] = useState(member.role.id);
  const [limited, setLimited] = useState(member.propertyIds.length > 0);
  const [propertyIds, setPropertyIds] = useState<string[]>(member.propertyIds);
  const [accessError, setAccessError] = useState<string | undefined>();

  const access = propertyAccessValue(limited, propertyIds);
  const roleChanged = roleId !== member.role.id;
  const propertiesChanged = access.ok && !sameIds(access.ids, member.propertyIds);

  const change = useMutation({
    // Changing a role needs a step-up code; the client asks for it and retries.
    mutationFn: (body: { roleId?: string; propertyIds?: string[] }) => api.patch(`/users/${member.userId}`, body),
    onSuccess: (_r, body) => {
      const role = roles.find((r) => r.id === roleId);
      const parts = [
        body.roleId ? `is now ${role?.name ?? 'in the new role'}` : null,
        body.propertyIds ? (body.propertyIds.length === 0 ? 'sees all properties' : `sees ${body.propertyIds.length} ${body.propertyIds.length === 1 ? 'property' : 'properties'}`) : null,
      ].filter(Boolean);
      onChanged(`${displayName(member)} ${parts.join(' and ')}.`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && error.fieldErrors.propertyIds) {
        setAccessError(error.fieldErrors.propertyIds);
      }
    },
  });

  const save = () => {
    if (!access.ok) {
      setAccessError(access.error);
      return;
    }
    setAccessError(undefined);
    change.mutate({
      roleId: roleChanged ? roleId : undefined,
      propertyIds: propertiesChanged ? access.ids : undefined,
    });
  };

  const showError = change.isError && !(change.error instanceof ApiError && change.error.code === 'VALIDATION_FAILED' && accessError);

  return (
    <Sheet
      title={`Edit access — ${displayName(member)}`}
      busy={change.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={change.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={save}
            disabled={change.isPending || (!roleChanged && !propertiesChanged && access.ok)}>
            {change.isPending ? 'Saving…' : 'Save access'}
          </button>
        </>
      )}
    >
      <div className="sheet-form">
        <div className="fld">
          <label htmlFor="role-pick">Role</label>
          <select id="role-pick" value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={change.isPending}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <span className="hint">Takes effect immediately. Changing the role asks you to confirm with a code.</span>
        </div>

        <PropertyAccessPicker
          limited={limited}
          onLimitedChange={setLimited}
          value={propertyIds}
          onChange={setPropertyIds}
          error={accessError}
          disabled={change.isPending}
        />
      </div>

      {showError ? <p className="nx-sheet__error" role="alert">{settingsErrorMessage(change.error)}</p> : null}
    </Sheet>
  );
}
