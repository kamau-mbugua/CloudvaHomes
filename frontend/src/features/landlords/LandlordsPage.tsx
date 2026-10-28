import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { keys, portfolioErrorMessage } from '../portfolio/api';
import { LANDLORD_KIND, RECORD_STATUS } from '../portfolio/labels';
import type { Landlord } from '../portfolio/types';
import { useListFilters } from '../portfolio/hooks';
import { Badge } from '../portfolio/ui';
import { LandlordSheet } from './LandlordSheet';

/**
 * Landlords: the owners an agency manages properties for. Only reachable in an agency —
 * the route and the menu both hide it from a landlord's own organisation.
 */

const PAGE_SIZE = 25;

export function LandlordsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status');
  const canCreate = useCan('landlords:create');
  const canUpdate = useCan('landlords:update');
  const canDelete = useCan('landlords:delete');
  const [editing, setEditing] = useState<Landlord | 'new' | null>(null);

  const list = useQuery({
    queryKey: [...keys.landlords, { q, status, page }],
    queryFn: () => api.get<PageEnvelope<Landlord>>('/landlords', { page, pageSize: PAGE_SIZE, q, status }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (landlord: Landlord) => api.delete(`/landlords/${landlord.id}`),
    onSuccess: async (_r, landlord) => {
      toast.saved(`${landlord.name} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.landlords });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || status);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by name, code or phone" aria-label="Search landlords"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {canCreate ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setEditing('new')}>Add landlord</button>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No landlords match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState title="No landlords yet" detail="Add the owners you manage property for, then their properties."
              action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add landlord</button> : undefined} />
          )}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Landlord</th>
                <th>Contact</th>
                <th className="num">Properties</th>
                <th>Status</th>
                <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((landlord) => (
                <tr key={landlord.id}>
                  <td>
                    <Link className="ad__link" to={`/app/landlords/${landlord.id}`}><strong>{landlord.name}</strong></Link>
                    <span className="ad__sub"><span className="num">{landlord.code}</span> · {LANDLORD_KIND[landlord.kind] ?? landlord.kind}</span>
                  </td>
                  <td>
                    <span className="num">{landlord.phone}</span>
                    {landlord.email ? <span className="ad__sub">{landlord.email}</span> : null}
                  </td>
                  <td className="num">{landlord.propertyCount}</td>
                  <td><Badge table={RECORD_STATUS} value={landlord.status} /></td>
                  <td className="ad__rowactions">
                    <div>
                      {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(landlord)}>Edit</button> : null}
                      {canDelete ? (
                        <ConfirmDelete what={landlord.name}
                          consequence={landlord.propertyCount > 0
                            ? `They still have ${landlord.propertyCount} ${landlord.propertyCount === 1 ? 'property' : 'properties'}, so they can’t be deleted. Mark them inactive instead.`
                            : 'This cannot be undone.'}
                          busy={remove.isPending && remove.variables?.id === landlord.id}
                          onConfirm={() => remove.mutate(landlord)} />
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

      {editing ? <LandlordSheet landlord={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
