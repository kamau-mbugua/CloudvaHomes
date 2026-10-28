import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { Role } from '../../lib/auth/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { keys, settingsErrorMessage, useRoles } from './api';

/** Settings → Roles: the named permission sets people are given. */
export function RolesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = useCan('roles:create');
  const canDelete = useCan('roles:delete');
  const roles = useRoles();

  const remove = useMutation({
    mutationFn: (role: Role) => api.delete(`/roles/${role.id}`),
    onSuccess: (_r, role) => {
      toast.saved(`The ${role.name} role was deleted.`);
      return queryClient.invalidateQueries({ queryKey: keys.roles });
    },
    onError: (error) => toast.failed(settingsErrorMessage(error)),
  });

  return (
    <div className="pg">
      <div className="ad__filters">
        <p className="ad__muted pg-grow">
          A role is a set of permissions. Owner always has every permission; the other built-in roles can be adjusted.
        </p>
        {canCreate ? (
          <Link className="nx-btn nx-btn--primary" to="/app/settings/roles/new">New role</Link>
        ) : null}
      </div>

      {roles.isError ? <p className="ad__error" role="alert">{settingsErrorMessage(roles.error)}</p> : null}

      {roles.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : roles.data && roles.data.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No roles yet" /></div>
      ) : roles.data ? (
        <div className="ad__tablewrap">
          <table className="ad__table ad__table--compact">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th className="num">Members</th>
                <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {roles.data.map((role) => (
                <tr key={role.id}>
                  <td>
                    <Link className="ad__link" to={`/app/settings/roles/${role.id}`}><strong>{role.name}</strong></Link>
                    {role.isSystem ? <span className="ad__badge ad__badge--off role-badge">System</span> : null}
                  </td>
                  <td className="ad__muted">{role.description || '—'}</td>
                  <td className="num">{role.memberCount}</td>
                  <td className="ad__rowactions">
                    <div>
                      <button type="button" className="nx-btn nx-btn--sm" onClick={() => navigate(`/app/settings/roles/${role.id}`)}>
                        {role.systemKey === 'OWNER' ? 'View' : 'Open'}
                      </button>
                      {canDelete && !role.isSystem ? (
                        <ConfirmDelete
                          what={`the "${role.name}" role`}
                          consequence={role.memberCount > 0
                            ? `${role.memberCount} ${role.memberCount === 1 ? 'person has' : 'people have'} this role — move them to another role first.`
                            : undefined}
                          busy={remove.isPending && remove.variables?.id === role.id}
                          onConfirm={() => remove.mutate(role)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
