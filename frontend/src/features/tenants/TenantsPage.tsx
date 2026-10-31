import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { Sheet } from '../../components/Sheet';
import { unwrap } from '../payments/rules';
import { messageKeys, tenantMessagingError } from './messages';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { keys, portfolioErrorMessage, usePropertyOptions } from '../portfolio/api';
import { TENANT_STATUS, optionsOf, personName } from '../portfolio/labels';
import type { Tenant } from '../portfolio/types';
import { useListFilters } from '../portfolio/hooks';
import { Badge } from '../portfolio/ui';
import { MoveInSheet } from './MoveInSheet';
import { TenantSheet } from './TenantSheet';
import { TenantsCsvImportSheet } from './TenantsCsvImportSheet';

/**
 * Tenants: everyone the organisation rents to, has rented to, or has registered ahead of
 * a move-in. Status is derived by the server — Current (living somewhere now), Past (only
 * ended tenancies), Prospect (no tenancy yet).
 */

const PAGE_SIZE = 25;

export function TenantsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status');
  const propertyId = filters.get('propertyId');

  const canCreate = useCan('tenants:create');
  const canUpdate = useCan('tenants:update');
  const canDelete = useCan('tenants:delete');
  const canMoveIn = useCan('tenancies:create');
  const canSeeProperties = useCan('properties:view');
  const canSeeUnits = useCan('units:view');

  const [editing, setEditing] = useState<Tenant | 'new' | null>(null);
  const [movingIn, setMovingIn] = useState<Tenant | null>(null);
  const [invitingAll, setInvitingAll] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);

  const list = useQuery({
    queryKey: [...keys.tenants, { q, status, propertyId, page }],
    queryFn: () => api.get<PageEnvelope<Tenant>>('/tenants', { page, pageSize: PAGE_SIZE, q, status, propertyId }),
    placeholderData: keepPreviousData,
  });
  const properties = usePropertyOptions(canSeeProperties);

  const remove = useMutation({
    mutationFn: (tenant: Tenant) => api.delete(`/tenants/${tenant.id}`),
    onSuccess: async (_r, tenant) => {
      toast.saved(`${personName(tenant)} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.tenants });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  const inviteAll = useMutation({
    mutationFn: () => api.post<unknown>('/tenants/portal-access', propertyId ? { propertyId } : {})
      .then((body) => unwrap<{ invited?: number } | undefined>(body)),
    onSuccess: async (out) => {
      setInvitingAll(false);
      const n = out?.invited ?? 0;
      toast.saved(n === 0 ? 'Every current tenant already has portal access.' : `${n === 1 ? 'One tenant was' : `${n} tenants were`} given portal access and texted the link.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.tenants }),
        queryClient.invalidateQueries({ queryKey: messageKeys.messages }),
      ]);
    },
    onError: (error) => toast.failed(tenantMessagingError(error)),
  });
  const runReminders = useMutation({
    mutationFn: () =>
      api
        .post<unknown>('/tenants/run-reminders', {})
        .then((body) => unwrap<{ dueSent?: number; overdueSent?: number } | undefined>(body)),
    onSuccess: async (out) => {
      const total = (out?.dueSent ?? 0) + (out?.overdueSent ?? 0);
      toast.saved(
        total === 0
          ? 'No due or overdue reminders were needed right now.'
          : `Sent ${total} rent reminder${total === 1 ? '' : 's'} (${out?.dueSent ?? 0} due soon, ${out?.overdueSent ?? 0} overdue).`,
      );
      await queryClient.invalidateQueries({ queryKey: messageKeys.messages });
    },
    onError: (error) => toast.failed(tenantMessagingError(error)),
  });
  const propertyName = (properties.data?.data ?? []).find((p) => p.id === propertyId)?.name;

  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || status || propertyId);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by name, phone, code or email" aria-label="Search tenants"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">All tenants</option>
          {optionsOf(TENANT_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {canSeeProperties ? (
          <select className="ad__select" aria-label="Property" value={propertyId} onChange={(e) => filters.setFilter({ propertyId: e.target.value })}>
            <option value="">All properties</option>
            {(properties.data?.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
        {canUpdate ? (
          <>
            <button
              type="button"
              className="nx-btn pg-push"
              disabled={runReminders.isPending}
              onClick={() => runReminders.mutate()}
            >
              {runReminders.isPending ? 'Sending reminders…' : 'Send due reminders'}
            </button>
            <button type="button" className="nx-btn" onClick={() => setInvitingAll(true)}>
              {propertyId ? 'Give portal access to this property’s tenants' : 'Give portal access to all current tenants'}
            </button>
          </>
        ) : null}
        {canCreate ? (
          <>
            <button type="button" className={`nx-btn ${canUpdate ? '' : 'pg-push'}`} onClick={() => setImportingCsv(true)}>Import CSV</button>
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setEditing('new')}>Add tenant</button>
          </>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No tenants match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState title="No tenants yet" detail="Register a tenant here, or add them while moving them into a unit."
              action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add tenant</button> : undefined} />
          )}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Contact</th>
                <th>Lives in</th>
                <th>Status</th>
                <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <Link className="ad__link" to={`/app/tenants/${tenant.id}`}><strong>{personName(tenant)}</strong></Link>
                    <span className="ad__sub num">{tenant.code}</span>
                  </td>
                  <td>
                    <span className="num">{tenant.phone}</span>
                    {tenant.email ? <span className="ad__sub">{tenant.email}</span> : null}
                  </td>
                  <td>
                    {tenant.currentUnits.length === 0 ? <span className="ad__muted">—</span> : tenant.currentUnits.map((cu) => (
                      <span key={cu.tenancyId} className="ad__sub">
                        {canSeeUnits ? <Link className="ad__link" to={`/app/units/${cu.unitId}`}><strong>{cu.unitNumber}</strong></Link> : <strong>{cu.unitNumber}</strong>}
                        {' · '}{cu.propertyName}
                      </span>
                    ))}
                  </td>
                  <td><Badge table={TENANT_STATUS} value={tenant.status} /></td>
                  <td className="ad__rowactions">
                    <div>
                      {canMoveIn ? (
                        <button type="button" className="nx-btn nx-btn--sm" onClick={() => setMovingIn(tenant)}>Move in</button>
                      ) : null}
                      {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(tenant)}>Edit</button> : null}
                      {canDelete && tenant.status === 'PROSPECT' ? (
                        <ConfirmDelete what={personName(tenant)}
                          consequence="Only someone who has never had a tenancy can be deleted. This cannot be undone."
                          busy={remove.isPending && remove.variables?.id === tenant.id}
                          onConfirm={() => remove.mutate(tenant)} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />

      {editing ? <TenantSheet tenant={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {movingIn ? <MoveInSheet tenant={movingIn} onClose={() => setMovingIn(null)} /> : null}
      {importingCsv ? <TenantsCsvImportSheet onClose={() => setImportingCsv(false)} /> : null}
      {invitingAll ? (
        <Sheet
          title="Give portal access?"
          busy={inviteAll.isPending}
          onClose={() => setInvitingAll(false)}
          footer={(
            <>
              <button type="button" className="nx-btn" onClick={() => setInvitingAll(false)} disabled={inviteAll.isPending}>Cancel</button>
              <button type="button" className="nx-btn nx-btn--primary" disabled={inviteAll.isPending} onClick={() => inviteAll.mutate()}>
                {inviteAll.isPending ? 'Giving access…' : 'Give access and text them'}
              </button>
            </>
          )}
        >
          <p>
            Every current tenant{propertyId ? ` of ${propertyName ?? 'the chosen property'}` : ''} who doesn’t have portal access yet gets
            it, plus an SMS and email with their sign-in and password-setup links. They sign in with a one-time code or password and see only their own account. You can remove
            access for anyone from their page.
          </p>
        </Sheet>
      ) : null}
    </div>
  );
}
