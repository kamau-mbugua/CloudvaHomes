import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { useSession } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { Field } from '../portfolio/ui';
import { keys, platformErrorMessage, usePlatformOperators, useUnassignedOrganizations } from '../platform/api';
import { formatDayish } from '../platform/rules';
import type { PlatformOperator } from '../platform/types';
import { OrgStatusBadge } from '../platform/ui';

type RoleFilter = 'ALL' | 'SUPERADMIN' | 'SALESPERSON';

/**
 * Admin → Admins & Salespeople (`/admin/admins`): manages Hodi's internal staff —
 * Superadmins (full platform access) and Salespeople (scoped to their onboarded/assigned
 * book of organisations). Also assigns unassigned organisations to an operator's book.
 */
export function AdminOperatorsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const operators = usePlatformOperators();

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [creating, setCreating] = useState(false);
  const [assigningFor, setAssigningFor] = useState<PlatformOperator | null>(null);

  const updateOperator = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<unknown>(`/platform/operators/${encodeURIComponent(id)}`, body),
    onSuccess: async () => {
      toast.saved('Operator updated.');
      await queryClient.invalidateQueries({ queryKey: keys.operators });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const all = operators.data ?? [];
  const roleOf = (op: PlatformOperator) => op.role ?? op.platformRole ?? 'SALESPERSON';
  const rows = roleFilter === 'ALL' ? all : all.filter((op) => roleOf(op) === roleFilter);

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Operator roles">
          <button type="button" role="tab" aria-selected={roleFilter === 'ALL'} className="pf__tab" onClick={() => setRoleFilter('ALL')}>
            All ({all.length})
          </button>
          <button type="button" role="tab" aria-selected={roleFilter === 'SUPERADMIN'} className="pf__tab" onClick={() => setRoleFilter('SUPERADMIN')}>
            Superadmins ({all.filter((o) => roleOf(o) === 'SUPERADMIN').length})
          </button>
          <button type="button" role="tab" aria-selected={roleFilter === 'SALESPERSON'} className="pf__tab" onClick={() => setRoleFilter('SALESPERSON')}>
            Salespeople ({all.filter((o) => roleOf(o) === 'SALESPERSON').length})
          </button>
        </div>
        <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setCreating(true)}>
          + Add operator
        </button>
      </div>

      {operators.isError ? <p className="ad__error" role="alert">{platformErrorMessage(operators.error)}</p> : null}

      {operators.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState title="No operators in this view" detail="Add a Superadmin or Salesperson to manage KodiHub." />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Role</th>
                <th>Status</th>
                <th className="num">Organisations</th>
                <th>Last sign-in</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((op) => {
                const isSelf = op.id === user?.id;
                const opRole = roleOf(op);
                return (
                  <tr key={op.id}>
                    <td>
                      <strong>{op.firstName} {op.lastName}</strong>
                      <span className="ad__sub">{op.email}{op.phone ? ` · ${op.phone}` : ''}</span>
                    </td>
                    <td>
                      <span className={`ad__badge ${opRole === 'SUPERADMIN' ? 'ad__badge--info' : 'ad__badge--ok'}`}>
                        {opRole === 'SUPERADMIN' ? 'Superadmin' : 'Salesperson'}
                      </span>
                    </td>
                    <td>
                      <span className={`ad__badge ${op.status === 'ACTIVE' ? 'ad__badge--ok' : 'ad__badge--off'}`}>
                        {op.status === 'ACTIVE' ? 'Active' : op.status}
                      </span>
                    </td>
                    <td className="num">{op.organizationsCount ?? op.organizationCount ?? 0}</td>
                    <td>{op.lastLoginAt ? formatDateTime(op.lastLoginAt) : formatDayish(op.createdAt)}</td>
                    <td className="ad__rowactions">
                      <div>
                        <button type="button" className="nx-btn nx-btn--sm" onClick={() => setAssigningFor(op)}>
                          Assign orgs
                        </button>
                        {!isSelf ? (
                          <>
                            <button
                              type="button"
                              className="nx-btn nx-btn--sm"
                              disabled={updateOperator.isPending}
                              onClick={() => updateOperator.mutate({
                                id: op.id,
                                body: { role: opRole === 'SUPERADMIN' ? 'SALESPERSON' : 'SUPERADMIN' },
                              })}
                            >
                              Make {opRole === 'SUPERADMIN' ? 'Salesperson' : 'Superadmin'}
                            </button>
                            <button
                              type="button"
                              className={`nx-btn nx-btn--sm ${op.status === 'ACTIVE' ? 'nx-btn--danger' : ''}`}
                              disabled={updateOperator.isPending}
                              onClick={() => updateOperator.mutate({
                                id: op.id,
                                body: { status: op.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' },
                              })}
                            >
                              {op.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                            </button>
                          </>
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

      {creating ? <CreateOperatorSheet onClose={() => setCreating(false)} /> : null}
      {assigningFor ? <AssignOrganizationsSheet operator={assigningFor} onClose={() => setAssigningFor(null)} /> : null}
    </div>
  );
}

function CreateOperatorSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [platformRole, setPlatformRole] = useState<'SUPERADMIN' | 'SALESPERSON'>('SALESPERSON');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<unknown>('/platform/operators', body),
    onSuccess: async () => {
      toast.saved(`${firstName} ${lastName} added as ${platformRole === 'SUPERADMIN' ? 'Superadmin' : 'Salesperson'}.`);
      await queryClient.invalidateQueries({ queryKey: keys.operators });
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
    if (!email.trim() || !email.includes('@')) next.email = 'Enter a valid email address.';
    if (password.length < 12) next.password = 'Password must be at least 12 characters.';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      password,
      role: platformRole,
    });
  };

  return (
    <Sheet
      title="Add platform operator"
      busy={create.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={create.isPending}>Cancel</button>
          <button type="submit" form="op-create" className="nx-btn nx-btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add operator'}
          </button>
        </>
      )}
    >
      <form id="op-create" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">
          <strong>Salespeople</strong> can onboard organisations and see only the organisations, invoices, and payments in their book.
          {' '}<strong>Superadmins</strong> have full platform access.
        </p>
        <div className="fm__grid sheet-grid">
          <Field id="op-first" label="First name" error={errors.firstName}>
            <input id="op-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field id="op-last" label="Last name" error={errors.lastName}>
            <input id="op-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field id="op-email" label="Email" error={errors.email}>
            <input id="op-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="op-phone" label="Phone" optional error={errors.phone}>
            <input id="op-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field id="op-role" label="Role" error={errors.platformRole}>
            <select id="op-role" value={platformRole} onChange={(e) => setPlatformRole(e.target.value as 'SUPERADMIN' | 'SALESPERSON')}>
              <option value="SALESPERSON">Salesperson</option>
              <option value="SUPERADMIN">Superadmin</option>
            </select>
          </Field>
          <Field id="op-pass" label="Initial password" error={errors.password} hint="At least 12 characters.">
            <input id="op-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

function AssignOrganizationsSheet({ operator, onClose }: { operator: PlatformOperator; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const unassigned = useUnassignedOrganizations();
  const [selected, setSelected] = useState<string[]>([]);

  const assign = useMutation({
    mutationFn: (organizationIds: string[]) =>
      api.post<unknown>(`/platform/operators/${encodeURIComponent(operator.id)}/assign-organizations`, { organizationIds }),
    onSuccess: async () => {
      toast.saved(`Assigned ${selected.length} ${selected.length === 1 ? 'organisation' : 'organisations'} to ${operator.firstName}.`);
      await queryClient.invalidateQueries({ queryKey: keys.platform });
      onClose();
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const rows = unassigned.data ?? [];

  return (
    <Sheet
      title={`Assign organisations — ${operator.firstName} ${operator.lastName}`}
      busy={assign.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={assign.isPending}>Cancel</button>
          <button
            type="button"
            className="nx-btn nx-btn--primary"
            disabled={assign.isPending || selected.length === 0}
            onClick={() => assign.mutate(selected)}
          >
            {assign.isPending ? 'Assigning…' : `Assign (${selected.length})`}
          </button>
        </>
      )}
    >
      <div className="sheet-form">
        <p className="ad__muted">Select unassigned organisations to add to {operator.firstName}’s book of business.</p>
        {unassigned.isPending ? (
          <p className="ad__muted">Loading unassigned organisations…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="All organisations are assigned" detail="You can also reassign any organisation from its detail page." />
        ) : (
          <div className="ad__tablewrap">
            <table className="ad__table ad__table--compact">
              <thead>
                <tr>
                  <th />
                  <th>Organisation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(org.id)}
                        onChange={() => toggle(org.id)}
                        aria-label={`Select ${org.name}`}
                      />
                    </td>
                    <td>
                      <strong>{org.name}</strong>
                      <span className="ad__sub num">{org.billingRef}</span>
                    </td>
                    <td><OrgStatusBadge status={org.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Sheet>
  );
}
