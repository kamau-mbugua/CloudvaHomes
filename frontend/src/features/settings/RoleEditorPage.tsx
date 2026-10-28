import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import type { PermissionGroup, Role } from '../../lib/auth/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { keys, settingsErrorMessage, usePermissionCatalogue } from './api';
import type { GroupState } from './permissionMatrix';
import { groupState, samePermissions, toggleGroup, toggleOne } from './permissionMatrix';

/**
 * `/app/settings/roles/new` and `/app/settings/roles/:roleId` — a role's name and its
 * permission matrix, grouped as `GET /permissions` groups them.
 *
 * Owner is read-only (it always has everything). Changing a role's permissions asks for a
 * step-up code; renaming alone does not, so permissions are only sent when they changed.
 */
export function RoleEditorPage() {
  const { roleId } = useParams();
  const isNew = !roleId || roleId === 'new';

  const role = useQuery({
    queryKey: keys.role(roleId ?? 'new'),
    queryFn: () => api.get<DataEnvelope<Role>>(`/roles/${roleId}`).then((r) => r.data),
    enabled: !isNew,
  });
  const catalogue = usePermissionCatalogue();

  const error = (role.isError && role.error) || (catalogue.isError && catalogue.error);
  if (error) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="ph">
          <EmptyState title="Role not found" detail="It may have been deleted."
            action={<Link className="nx-btn nx-btn--sm" to="/app/settings/roles">Back to roles</Link>} />
        </div>
      );
    }
    return <p className="ad__error" role="alert">{settingsErrorMessage(error)}</p>;
  }

  if ((!isNew && role.isPending) || catalogue.isPending) return <p className="ad__muted" role="status">Loading…</p>;

  return (
    <RoleForm
      key={role.data?.id ?? 'new'}
      role={isNew ? null : (role.data ?? null)}
      groups={catalogue.data ?? []}
    />
  );
}

function RoleForm({ role, groups }: { role: Role | null; groups: PermissionGroup[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = useCan('roles:create');
  const canUpdate = useCan('roles:update');
  const canDelete = useCan('roles:delete');

  const isOwner = role?.systemKey === 'OWNER';
  const readOnly = isOwner || (role ? !canUpdate : !canCreate);

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [errors, setErrors] = useState<{ name?: string; permissions?: string }>({});

  const allKeys = groups.flatMap((g) => g.permissions.map((p) => p.key));
  const shown = isOwner ? new Set(allKeys) : selected;

  const save = useMutation({
    mutationFn: async () => {
      const base = { name: name.trim(), description: description.trim() || null };
      if (!role) {
        return api.post<DataEnvelope<Role>>('/roles', { ...base, permissions: [...selected] });
      }
      const permissionsChanged = !samePermissions(selected, role.permissions);
      return api.patch<DataEnvelope<Role>>(`/roles/${role.id}`, permissionsChanged ? { ...base, permissions: [...selected] } : base);
    },
    onSuccess: async (result) => {
      toast.saved(role ? `The ${result.data?.name ?? name.trim()} role was saved.` : `The ${name.trim()} role was created.`);
      await queryClient.invalidateQueries({ queryKey: keys.roles });
      // Members' permissions may have changed — including your own.
      await queryClient.invalidateQueries({ queryKey: keys.users });
      navigate('/app/settings/roles');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(error.fieldErrors);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/roles/${role?.id}`),
    onSuccess: async () => {
      toast.saved(`The ${role?.name} role was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.roles });
      navigate('/app/settings/roles');
    },
    onError: (error) => toast.failed(settingsErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    const found: typeof errors = {};
    if (!name.trim()) found.name = 'Give the role a name.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate();
  };

  const showServerError = save.isError && !(save.error instanceof ApiError && save.error.code === 'VALIDATION_FAILED' && errors.name);

  return (
    <form className="fm fm--single" onSubmit={submit} noValidate>
      <nav className="bc" aria-label="Breadcrumb">
        <ol>
          <li><Link to="/app/settings/roles">Roles</Link></li>
          <li aria-current="page">{role ? role.name : 'New role'}</li>
        </ol>
      </nav>

      <div className="fm__main">
        {isOwner ? (
          <p className="ad__callout ad__callout--info">
            The Owner role always has every permission and cannot be changed. Every organisation keeps at least one active Owner.
          </p>
        ) : readOnly ? (
          <p className="ad__callout ad__callout--info">Your role can view roles but not change them.</p>
        ) : null}

        <section className="fm__section">
          <h2>Role</h2>
          {role?.isSystem && !isOwner ? <p>A built-in role: you can adjust it, but not delete it.</p> : null}
          <div className="fm__grid">
            <div className={`fld ${errors.name ? 'is-bad' : ''}`}>
              <label htmlFor="role-name">Name</label>
              <input id="role-name" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly || save.isPending}
                placeholder="e.g. Leasing assistant" aria-invalid={Boolean(errors.name)} />
              {errors.name ? <span className="fld__err">{errors.name}</span> : null}
            </div>
            <div className="fld">
              <label htmlFor="role-desc">Description</label>
              <input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly || save.isPending} placeholder="What people with this role do" />
            </div>
          </div>
        </section>

        <section className="fm__section">
          <div className="pm__head">
            <div>
              <h2>Permissions</h2>
              <p className="pm__count"><span className="num">{shown.size}</span> of <span className="num">{allKeys.length}</span> selected</p>
            </div>
            {!readOnly ? (
              <div className="pm__bulk">
                <button type="button" className="nx-btn nx-btn--sm" onClick={() => setSelected(new Set(allKeys))}>Select all</button>
                <button type="button" className="nx-btn nx-btn--sm" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            ) : null}
          </div>
          {errors.permissions ? <p className="fld__err">{errors.permissions}</p> : null}

          <div className="pm">
            {groups.map((group) => {
              const groupKeys = group.permissions.map((p) => p.key);
              const state = groupState(shown, groupKeys);
              return (
                <fieldset key={group.group} className="pm__group" disabled={readOnly || save.isPending}>
                  <legend className="pm__legend">
                    <GroupCheckbox
                      state={state}
                      label={group.label}
                      onToggle={() => setSelected((s) => toggleGroup(s, groupKeys))}
                    />
                  </legend>
                  <div className="pm__items">
                    {group.permissions.map((permission) => (
                      <label key={permission.key} className="fld__check pm__item">
                        <input
                          type="checkbox"
                          checked={shown.has(permission.key)}
                          onChange={() => setSelected((s) => toggleOne(s, permission.key))}
                        />
                        {permission.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>

        {showServerError ? <p className="ad__error" role="alert">{settingsErrorMessage(save.error)}</p> : null}

        <div className="pg-actions">
          {role && !role.isSystem && canDelete ? (
            <div className="pg-grow">
              <ConfirmDelete
                size="md"
                label="Delete role"
                what={`the "${role.name}" role`}
                consequence={role.memberCount > 0
                  ? `${role.memberCount} ${role.memberCount === 1 ? 'person has' : 'people have'} this role — move them to another role first.`
                  : undefined}
                busy={remove.isPending}
                onConfirm={() => remove.mutate()}
              />
            </div>
          ) : null}
          <Link className="nx-btn" to="/app/settings/roles">{readOnly ? 'Back to roles' : 'Cancel'}</Link>
          {!readOnly ? (
            <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : role ? 'Save role' : 'Create role'}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** A group's "select all" box, showing the in-between state when only some are on. */
function GroupCheckbox({ state, label, onToggle }: { state: GroupState; label: string; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);

  return (
    <label className="fld__check pm__grouplabel">
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'all'}
        onChange={onToggle}
        aria-label={`All ${label} permissions`}
      />
      <span>{label}</span>
    </label>
  );
}
