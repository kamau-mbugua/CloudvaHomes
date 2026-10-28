import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { UnitInvoices } from '../billing/InvoicesSection';
import { DepositPanel } from '../payments/DepositPanel';
import { MoveInSheet } from '../tenants/MoveInSheet';
import { TenancyActions } from '../tenants/TenancyActions';
import { TenancyTable } from '../tenants/TenancyTable';
import { keys, portfolioErrorMessage } from './api';
import { OCCUPANCY, RECORD_STATUS, TENANCY_STATUS, personName } from './labels';
import type { Tenancy, Unit } from './types';
import { UnitSheet } from './UnitSheet';
import { Badge, Breadcrumbs, Fact } from './ui';

/**
 * One unit: what it is, who lives there now, and everyone who has lived there
 * (`GET /tenancies?unitId=`, newest first). "Move in" shows on a vacant, active unit.
 */
export function UnitDetailPage() {
  const { unitId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('units:update');
  const canDelete = useCan('units:delete');
  const canMoveIn = useCan('tenancies:create');
  const canSeeTenancies = useCan('tenancies:view');
  const canSeeTenants = useCan('tenants:view');
  const [editing, setEditing] = useState(false);
  const [movingIn, setMovingIn] = useState(false);

  const unit = useQuery({
    queryKey: [...keys.units, unitId],
    queryFn: () => api.get<DataEnvelope<Unit>>(`/units/${unitId}`).then((r) => r.data),
  });
  const history = useQuery({
    queryKey: [...keys.tenancies, { unitId }],
    queryFn: () => api.get<PageEnvelope<Tenancy>>('/tenancies', { unitId, pageSize: 50 }),
    enabled: canSeeTenancies,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/units/${unitId}`),
    onSuccess: async () => {
      toast.saved(`Unit ${unit.data?.number} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.units });
      await queryClient.invalidateQueries({ queryKey: keys.properties });
      navigate(unit.data ? `/app/properties/${unit.data.property.id}` : '/app/units', { replace: true });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  if (unit.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (unit.isError) {
    return (
      <div className="ph">
        <EmptyState title="Unit not available" detail={portfolioErrorMessage(unit.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/units">Back to units</Link>} />
      </div>
    );
  }

  const u = unit.data;
  const current = u.currentTenancy;
  // The full current tenancy (with rent and deposit) comes from the history list.
  const currentFull = current ? history.data?.data.find((t) => t.id === current.id) : undefined;
  const rows = history.data?.data ?? [];

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[
        { label: 'Units', to: '/app/units' },
        { label: u.property.name, to: `/app/properties/${u.property.id}` },
        { label: u.number },
      ]} />

      <div className="pf__head">
        <div>
          <h1>
            Unit {u.number}
            <Badge table={OCCUPANCY} value={u.occupancy} />
            {u.status === 'INACTIVE' ? <Badge table={RECORD_STATUS} value={u.status} /> : null}
          </h1>
          <p><Link to={`/app/properties/${u.property.id}`}>{u.property.name}</Link> · {formatKES(u.rentAmount)} a month</p>
        </div>
        <div className="sl__headactions">
          {canMoveIn && u.occupancy === 'VACANT' && u.status === 'ACTIVE' ? (
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setMovingIn(true)}>Move in</button>
          ) : null}
          {canUpdate ? <button type="button" className="nx-btn" onClick={() => setEditing(true)}>Edit</button> : null}
          {canDelete ? (
            <ConfirmDelete size="md" what={`unit ${u.number}`}
              consequence="Only a unit that has never had a tenancy can be deleted. Otherwise, mark it inactive."
              busy={remove.isPending} onConfirm={() => remove.mutate()} />
          ) : null}
        </div>
      </div>

      <section className="fm__section">
        <h2>Details</h2>
        <dl className="pf__facts">
          <Fact label="Type">{u.unitType?.name}</Fact>
          <Fact label="Category">{u.category?.name}</Fact>
          <Fact label="Floor">{u.floor != null ? String(u.floor) : null}</Fact>
          <Fact label="Size">{u.sizeSqft != null ? `${u.sizeSqft} sq ft` : null}</Fact>
          <Fact label="Rent"><span className="num">{formatKES(u.rentAmount)}</span></Fact>
          <Fact label="Features">{u.features.map((f) => f.name).join(', ')}</Fact>
          {u.description ? <Fact label="Description" wide>{u.description}</Fact> : null}
        </dl>
      </section>

      <section className="fm__section">
        <div className="pf__sectionhead"><h2>Current tenancy</h2></div>
        {current ? (
          <div className="pf__current">
            <div>
              <strong>
                {canSeeTenants
                  ? <Link className="ad__link" to={`/app/tenants/${current.tenant.id}`}>{personName(current.tenant)}</Link>
                  : personName(current.tenant)}
              </strong>{' '}
              <Badge table={TENANCY_STATUS} value={current.status} />
              <span className="ad__sub num">{current.tenant.code} · {current.tenant.phone}</span>
              <span className="ad__sub">
                Since {formatDay(current.startDate)}
                {current.status === 'NOTICE' && current.endDate ? ` · leaving ${formatDay(current.endDate)}` : ''}
                {currentFull ? ` · ${formatKES(currentFull.rentAmount)} due on day ${currentFull.billingDay}` : ''}
              </span>
            </div>
            <div className="ad__rowactions">
              <div>
                <TenancyActions
                  tenancy={{ ...current, unit: { number: u.number }, propertyId: u.property.id, rentAmount: currentFull?.rentAmount }}
                  size="md"
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="ad__muted">
            {u.status === 'INACTIVE' ? 'Vacant. The unit is inactive, so no one can move in until it is made active.' : 'Vacant.'}
          </p>
        )}
      </section>

      {current ? (
        <DepositSection tenancyId={current.id} status={current.status} who={personName(current.tenant)} />
      ) : null}

      {canSeeTenancies ? (
        <section className="fm__section">
          <div className="pf__sectionhead"><h2>History</h2></div>
          {history.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(history.error)}</p>
            : history.isPending ? <p className="ad__muted" role="status">Loading…</p>
              : rows.length === 0 ? <p className="ad__muted">No one has lived here yet.</p>
                : <TenancyTable rows={rows} showUnit={false} />}
        </section>
      ) : null}

      <UnitInvoices unitId={u.id} />

      {editing ? <UnitSheet unit={u} onClose={() => setEditing(false)} /> : null}
      {movingIn ? <MoveInSheet unit={u} onClose={() => setMovingIn(false)} /> : null}
    </div>
  );
}

/** The current tenancy's deposit — only for roles that can see payments. */
function DepositSection({ tenancyId, status, who }: { tenancyId: string; status: Tenancy['status']; who: string }) {
  const canView = useCan('payments:view');
  if (!canView) return null;
  return (
    <section className="fm__section">
      <div className="pf__sectionhead"><h2>Deposit</h2></div>
      <DepositPanel tenancy={{ id: tenancyId, status }} who={who} />
    </section>
  );
}
