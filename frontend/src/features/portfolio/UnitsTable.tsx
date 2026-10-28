import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { MoveInSheet } from '../tenants/MoveInSheet';
import { keys, portfolioErrorMessage } from './api';
import { OCCUPANCY, RECORD_STATUS, personName } from './labels';
import type { Unit } from './types';
import { UnitSheet } from './UnitSheet';
import { Badge } from './ui';

/**
 * Units as a table, with their row actions (Move in, Edit, Delete) — the units list and a
 * property's page. "Move in" appears only on vacant, active units.
 */
export function UnitsTable({ rows, showProperty = true }: { rows: Unit[]; showProperty?: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('units:update');
  const canDelete = useCan('units:delete');
  const canMoveIn = useCan('tenancies:create');
  const canSeeTenants = useCan('tenants:view');
  const [editing, setEditing] = useState<Unit | null>(null);
  const [movingInto, setMovingInto] = useState<Unit | null>(null);

  const remove = useMutation({
    mutationFn: (unit: Unit) => api.delete(`/units/${unit.id}`),
    onSuccess: async (_r, unit) => {
      toast.saved(`Unit ${unit.number} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.units });
      await queryClient.invalidateQueries({ queryKey: keys.properties });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  return (
    <>
      <div className="ad__tablewrap">
        <table className="ad__table">
          <thead>
            <tr>
              <th>Unit</th>
              {showProperty ? <th>Property</th> : null}
              <th>Type</th>
              <th className="num">Rent</th>
              <th>Occupancy</th>
              <th>Tenant</th>
              <th>Status</th>
              <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((unit) => {
              const tenancy = unit.currentTenancy;
              return (
                <tr key={unit.id}>
                  <td>
                    <Link className="ad__link" to={`/app/units/${unit.id}`}><strong>{unit.number}</strong></Link>
                    {unit.floor != null ? <span className="ad__sub">Floor {unit.floor}</span> : null}
                  </td>
                  {showProperty ? (
                    <td>
                      <Link className="ad__link" to={`/app/properties/${unit.property.id}`}>{unit.property.name}</Link>
                      <span className="ad__sub num">{unit.property.code}</span>
                    </td>
                  ) : null}
                  <td>
                    {unit.unitType?.name ?? '—'}
                    {unit.category ? <span className="ad__sub">{unit.category.name}</span> : null}
                  </td>
                  <td className="num">{formatKES(unit.rentAmount)}</td>
                  <td>
                    <Badge table={OCCUPANCY} value={unit.occupancy} />
                    {unit.occupancy === 'NOTICE' && tenancy?.endDate ? <span className="ad__sub">Leaving {formatDay(tenancy.endDate)}</span> : null}
                  </td>
                  <td>
                    {tenancy ? (
                      <>
                        {canSeeTenants
                          ? <Link className="ad__link" to={`/app/tenants/${tenancy.tenant.id}`}>{personName(tenancy.tenant)}</Link>
                          : personName(tenancy.tenant)}
                        <span className="ad__sub num">{tenancy.tenant.phone}</span>
                      </>
                    ) : <span className="ad__muted">—</span>}
                  </td>
                  <td><Badge table={RECORD_STATUS} value={unit.status} /></td>
                  <td className="ad__rowactions">
                    <div>
                      {canMoveIn && unit.occupancy === 'VACANT' && unit.status === 'ACTIVE' ? (
                        <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setMovingInto(unit)}>Move in</button>
                      ) : null}
                      {canUpdate ? (
                        <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(unit)}>Edit</button>
                      ) : null}
                      {canDelete ? (
                        <ConfirmDelete
                          what={`unit ${unit.number}`}
                          consequence="Only a unit that has never had a tenancy can be deleted. Otherwise, mark it inactive."
                          busy={remove.isPending && remove.variables?.id === unit.id}
                          onConfirm={() => remove.mutate(unit)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? <UnitSheet unit={editing} onClose={() => setEditing(null)} /> : null}
      {movingInto ? <MoveInSheet unit={movingInto} onClose={() => setMovingInto(null)} /> : null}
    </>
  );
}
