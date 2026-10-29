import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { keys, portfolioErrorMessage, useCatalogue, usePropertyOptions } from './api';
import { OCCUPANCY, optionsOf } from './labels';
import { PortfolioCsvImportSheet } from './PortfolioCsvImportSheet';
import type { Unit } from './types';
import { UnitSheet } from './UnitSheet';
import { UnitsTable } from './UnitsTable';
import { useListFilters } from './hooks';

/**
 * Units across every property the person can see. Search matches the unit number or the
 * current tenant's name or phone, so "who lives in A4" and "where does Wanjiru live" are
 * both one search.
 */

const PAGE_SIZE = 25;

export function UnitsPage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const propertyId = filters.get('propertyId');
  const occupancy = filters.get('occupancy');
  const unitTypeId = filters.get('unitTypeId');
  const categoryId = filters.get('categoryId');
  const status = filters.get('status');

  const canCreate = useCan('units:create');
  const canSeeProperties = useCan('properties:view');
  const [adding, setAdding] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);

  const list = useQuery({
    queryKey: [...keys.units, { q, propertyId, occupancy, unitTypeId, categoryId, status, page }],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', {
      page, pageSize: PAGE_SIZE, q, propertyId, occupancy, unitTypeId, categoryId, status,
    }),
    placeholderData: keepPreviousData,
  });
  const properties = usePropertyOptions(canSeeProperties);
  const types = useCatalogue('unit-types');
  const categories = useCatalogue('unit-categories');

  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || propertyId || occupancy || unitTypeId || categoryId || status);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by unit number, tenant name or phone" aria-label="Search units"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        {canSeeProperties ? (
          <select className="ad__select" aria-label="Property" value={propertyId} onChange={(e) => filters.setFilter({ propertyId: e.target.value })}>
            <option value="">All properties</option>
            {(properties.data?.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
        <select className="ad__select" aria-label="Occupancy" value={occupancy} onChange={(e) => filters.setFilter({ occupancy: e.target.value })}>
          <option value="">Any occupancy</option>
          {optionsOf(OCCUPANCY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="ad__select" aria-label="Type" value={unitTypeId} onChange={(e) => filters.setFilter({ unitTypeId: e.target.value })}>
          <option value="">All types</option>
          {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="ad__select" aria-label="Category" value={categoryId} onChange={(e) => filters.setFilter({ categoryId: e.target.value })}>
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {canCreate ? (
          <>
            <button type="button" className="nx-btn pg-push" onClick={() => setImportingCsv(true)}>Import CSV</button>
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setAdding(true)}>Add units</button>
          </>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No units match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState
              title="No units yet"
              detail="Add units one at a time, or a whole block at once from a number range."
              action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setAdding(true)}>Add units</button> : undefined}
            />
          )}
        </div>
      ) : (
        <UnitsTable rows={rows} />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />

      {adding ? <UnitSheet allowBulk onClose={() => setAdding(false)} /> : null}
      {importingCsv ? (
        <PortfolioCsvImportSheet
          defaultProperty={(properties.data?.data ?? []).find((p) => p.id === propertyId)}
          onClose={() => setImportingCsv(false)}
        />
      ) : null}
    </div>
  );
}
