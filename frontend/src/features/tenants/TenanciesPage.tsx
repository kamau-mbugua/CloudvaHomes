import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { keys, portfolioErrorMessage, usePropertyOptions } from '../portfolio/api';
import { TENANCY_STATUS, optionsOf } from '../portfolio/labels';
import type { Tenancy } from '../portfolio/types';
import { useListFilters } from '../portfolio/hooks';
import { MoveInSheet } from './MoveInSheet';
import { TenancyTable } from './TenancyTable';

/**
 * Tenancies: who lives (or lived) where, on what rent, newest first. The move-in sheet
 * starts here when neither the unit nor the tenant is known yet.
 */

const PAGE_SIZE = 25;

export function TenanciesPage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status');
  const propertyId = filters.get('propertyId');
  const canMoveIn = useCan('tenancies:create');
  const canSeeProperties = useCan('properties:view');
  const [movingIn, setMovingIn] = useState(false);

  const list = useQuery({
    queryKey: [...keys.tenancies, { q, status, propertyId, page }],
    queryFn: () => api.get<PageEnvelope<Tenancy>>('/tenancies', { page, pageSize: PAGE_SIZE, q, status, propertyId }),
    placeholderData: keepPreviousData,
  });
  const properties = usePropertyOptions(canSeeProperties);

  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || status || propertyId);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by tenant or unit" aria-label="Search tenancies"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          {optionsOf(TENANCY_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {canSeeProperties ? (
          <select className="ad__select" aria-label="Property" value={propertyId} onChange={(e) => filters.setFilter({ propertyId: e.target.value })}>
            <option value="">All properties</option>
            {(properties.data?.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
        {canMoveIn ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setMovingIn(true)}>Move in</button>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No tenancies match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState title="No tenancies yet" detail="Move a tenant into a vacant unit to start one."
              action={canMoveIn ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setMovingIn(true)}>Move in</button> : undefined} />
          )}
        </div>
      ) : (
        <TenancyTable rows={rows} />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />

      {movingIn ? <MoveInSheet onClose={() => setMovingIn(false)} /> : null}
    </div>
  );
}
