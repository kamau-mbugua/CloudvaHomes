import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { keys, portfolioErrorMessage } from './api';
import { OCCUPANCY, RECORD_STATUS, optionsOf } from './labels';
import { PropertySheet } from './PropertySheet';
import type { Property, Unit } from './types';
import { UnitSheet } from './UnitSheet';
import { UnitsTable } from './UnitsTable';
import { useDebounced } from './hooks';
import { Badge, Breadcrumbs, Fact } from './ui';

/**
 * One property: its details, occupancy at a glance and its units. "Add units" offers one
 * unit or a whole range at once (prefix + from–to).
 */

const PAGE_SIZE = 50;

export function PropertyDetailPage() {
  const { propertyId = '' } = useParams();
  const session = useSession();
  const isAgency = session.activeOrganization?.kind === 'AGENCY';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [occupancy, setOccupancy] = useState('');
  const [page, setPage] = useState(1);
  const [rawTab, setRawTab] = useState<'units' | 'details'>('units');

  const canUpdate = useCan('properties:update');
  const canDelete = useCan('properties:delete');
  const canAddUnits = useCan('units:create');
  const canSeeUnits = useCan('units:view');
  const canSeeLandlords = useCan('landlords:view') && isAgency;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const property = useQuery({
    queryKey: [...keys.properties, propertyId],
    queryFn: () => api.get<DataEnvelope<Property>>(`/properties/${propertyId}`).then((r) => r.data),
  });
  const units = useQuery({
    queryKey: [...keys.units, { propertyId, q, occupancy, page }],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', { propertyId, q, occupancy, page, pageSize: PAGE_SIZE }),
    enabled: canSeeUnits,
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/properties/${propertyId}`),
    onSuccess: async () => {
      toast.saved(`${property.data?.name} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.properties });
      await queryClient.invalidateQueries({ queryKey: keys.landlords });
      navigate('/app/properties', { replace: true });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  if (property.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (property.isError) {
    return (
      <div className="ph">
        <EmptyState title="Property not available" detail={portfolioErrorMessage(property.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/properties">Back to properties</Link>} />
      </div>
    );
  }

  const p = property.data;
  const rows = units.data?.data ?? [];
  const where = [p.location, p.county].filter(Boolean).join(', ');
  const tab: 'units' | 'details' = !canSeeUnits || rawTab === 'details' ? 'details' : 'units';

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[{ label: 'Properties', to: '/app/properties' }, { label: p.name }]} />

      <div className="pf__head">
        <div>
          <h1>
            {p.name}
            <span className="ad__badge ad__badge--off num">{p.code}</span>
            {p.status === 'INACTIVE' ? <Badge table={RECORD_STATUS} value={p.status} /> : null}
          </h1>
          <p>
            {where || 'No location recorded'}
            {p.landlord ? (
              <> · Owned by {canSeeLandlords ? <Link to={`/app/landlords/${p.landlord.id}`}>{p.landlord.name}</Link> : p.landlord.name}</>
            ) : null}
          </p>
        </div>
        <div className="sl__headactions">
          {canAddUnits ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setAdding(true)}>Add units</button> : null}
          {canUpdate ? <button type="button" className="nx-btn" onClick={() => setEditing(true)}>Edit</button> : null}
          {canDelete ? (
            <ConfirmDelete size="md" what={p.name}
              consequence={p.unitCount > 0
                ? `It still has ${p.unitCount} ${p.unitCount === 1 ? 'unit' : 'units'}, so it can’t be deleted yet. Mark it inactive instead.`
                : 'This cannot be undone.'}
              busy={remove.isPending} onConfirm={() => remove.mutate()} />
          ) : null}
        </div>
      </div>

      <div className="ad__stats pf__stats">
        <div className="ad__stat"><span className="ad__stat__label">Units</span><span className="ad__stat__value num">{p.unitCount}</span></div>
        <div className="ad__stat"><span className="ad__stat__label">Occupied</span><span className="ad__stat__value num">{p.occupiedCount}</span></div>
        <div className="ad__stat"><span className="ad__stat__label">On notice</span><span className="ad__stat__value num">{p.noticeCount}</span></div>
        <div className="ad__stat"><span className="ad__stat__label">Vacant</span><span className="ad__stat__value num">{p.vacantCount}</span></div>
      </div>

      {canSeeUnits ? (
        <div className="pf__tabsrow">
          <div className="pf__tabs" role="tablist" aria-label="Property sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'units'}
              className="pf__tab"
              onClick={() => setRawTab('units')}
            >
              Units ({p.unitCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'details'}
              className="pf__tab"
              onClick={() => setRawTab('details')}
            >
              Property details
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'details' ? (
        <section className="fm__section">
          <h2>Details</h2>
          <dl className="pf__facts">
            <Fact label="Code"><span className="num">{p.code}</span></Fact>
            <Fact label="Floors">{p.floors != null ? String(p.floors) : null}</Fact>
            <Fact label="Location">{p.location}</Fact>
            <Fact label="County">{p.county}</Fact>
          </dl>
        </section>
      ) : null}

      {canSeeUnits && tab === 'units' ? (
        <section className="fm__section">
          <div className="pf__sectionhead">
            <h2>Units</h2>
          </div>
          <div className="ad__filters pg-gap">
            <input className="ad__search" type="search" placeholder="Search by unit number or tenant" aria-label="Search units"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <select className="ad__select" aria-label="Occupancy" value={occupancy} onChange={(e) => { setOccupancy(e.target.value); setPage(1); }}>
              <option value="">Any occupancy</option>
              {optionsOf(OCCUPANCY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {units.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(units.error)}</p>
            : units.isPending ? <p className="ad__muted" role="status">Loading…</p>
              : rows.length === 0 ? (
                q || occupancy
                  ? <EmptyState title="No units match" onClear={() => { setSearch(''); setOccupancy(''); setPage(1); }} />
                  : <EmptyState title="No units yet" detail="Add them one at a time, or a whole block from a number range."
                      action={canAddUnits ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setAdding(true)}>Add units</button> : undefined} />
              ) : <UnitsTable rows={rows} showProperty={false} />}
          <Pager meta={units.data?.meta} onPage={(next) => setPage(next)} />
        </section>
      ) : null}

      {editing ? <PropertySheet property={p} onClose={() => setEditing(false)} /> : null}
      {adding ? <UnitSheet property={p} allowBulk onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
