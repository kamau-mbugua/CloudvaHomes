import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { keys, portfolioErrorMessage, useLandlordOptions } from './api';
import { RECORD_STATUS } from './labels';
import { PropertySheet } from './PropertySheet';
import type { Property } from './types';
import { useListFilters } from './hooks';
import { Badge } from './ui';

/**
 * Properties: buildings and compounds, with how many of their units are let.
 *
 * Agencies also see and filter by landlord. Deleting only works for a property with no
 * units (`409 PROPERTY_HAS_UNITS` otherwise) — the usual way out is marking it inactive.
 */

const PAGE_SIZE = 20;

export function PropertiesPage() {
  const session = useSession();
  const isAgency = session.activeOrganization?.kind === 'AGENCY';
  const queryClient = useQueryClient();
  const toast = useToast();
  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status');
  const landlordId = filters.get('landlordId');

  const canCreate = useCan('properties:create');
  const canUpdate = useCan('properties:update');
  const canDelete = useCan('properties:delete');
  const canSeeLandlords = useCan('landlords:view') && isAgency;

  const [editing, setEditing] = useState<Property | 'new' | null>(null);

  const list = useQuery({
    queryKey: [...keys.properties, { q, status, landlordId, page }],
    queryFn: () => api.get<PageEnvelope<Property>>('/properties', { page, pageSize: PAGE_SIZE, q, status, landlordId }),
    placeholderData: keepPreviousData,
  });
  const landlords = useLandlordOptions(canSeeLandlords);

  const remove = useMutation({
    mutationFn: (property: Property) => api.delete(`/properties/${property.id}`),
    onSuccess: async (_r, property) => {
      toast.saved(`${property.name} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.properties });
      await queryClient.invalidateQueries({ queryKey: keys.landlords });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || status || landlordId);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by name, code or location" aria-label="Search properties"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {canSeeLandlords ? (
          <select className="ad__select" aria-label="Landlord" value={landlordId} onChange={(e) => filters.setFilter({ landlordId: e.target.value })}>
            <option value="">All landlords</option>
            {(landlords.data?.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ) : null}
        {canCreate ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setEditing('new')}>Add property</button>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No properties match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState
              title="No properties yet"
              detail={isAgency ? 'Add a landlord, then the buildings you manage for them.' : 'Add the buildings and compounds you let.'}
              action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add property</button> : undefined}
            />
          )}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Property</th>
                {isAgency ? <th>Landlord</th> : null}
                <th>Location</th>
                <th className="num">Units</th>
                <th className="num">Occupied</th>
                <th className="num">Notice</th>
                <th className="num">Vacant</th>
                <th>Status</th>
                <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((property) => (
                <tr key={property.id}>
                  <td>
                    <Link className="ad__link" to={`/app/properties/${property.id}`}><strong>{property.name}</strong></Link>
                    <span className="ad__sub num">{property.code}</span>
                  </td>
                  {isAgency ? (
                    <td>
                      {property.landlord ? (
                        canSeeLandlords
                          ? <Link className="ad__link" to={`/app/landlords/${property.landlord.id}`}>{property.landlord.name}</Link>
                          : property.landlord.name
                      ) : '—'}
                    </td>
                  ) : null}
                  <td>
                    {property.location ?? '—'}
                    {property.county ? <span className="ad__sub">{property.county}</span> : null}
                  </td>
                  <td className="num">{property.unitCount}</td>
                  <td className="num">{property.occupiedCount}</td>
                  <td className="num">{property.noticeCount}</td>
                  <td className="num">{property.vacantCount}</td>
                  <td><Badge table={RECORD_STATUS} value={property.status} /></td>
                  <td className="ad__rowactions">
                    <div>
                      {canUpdate ? (
                        <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(property)}>Edit</button>
                      ) : null}
                      {canDelete ? (
                        <ConfirmDelete
                          what={property.name}
                          consequence={property.unitCount > 0
                            ? `It still has ${property.unitCount} ${property.unitCount === 1 ? 'unit' : 'units'}, so it can’t be deleted yet. Mark it inactive instead.`
                            : 'This cannot be undone.'}
                          busy={remove.isPending && remove.variables?.id === property.id}
                          onConfirm={() => remove.mutate(property)}
                        />
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

      {editing ? (
        <PropertySheet property={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
