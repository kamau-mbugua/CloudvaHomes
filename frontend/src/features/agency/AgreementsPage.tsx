import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { useLandlordOptions } from '../portfolio/api';
import { useListFilters } from '../portfolio/hooks';
import { Badge } from '../portfolio/ui';
import { agencyErrorMessage, agencyKeys, useAgreements } from './api';
import { AgreementSheet, EndAgreementSheet } from './AgreementSheet';
import { AGREEMENT_STATE, COLLECTION_MODE, COMMISSIONABLE_LINE } from './labels';
import { agreementState, describeRate, ordinal } from './rules';
import type { Agreement } from './types';

/**
 * Agreements (`/app/agreements`): the management terms per landlord — commission, who
 * collects, remittance day, dates. Filter by landlord and active/all; add, edit (while
 * unused), end, delete (while unused).
 */
export function AgreementsPage() {
  const filters = useListFilters();
  const landlordId = filters.get('landlordId');
  const show = filters.get('show') === 'all' ? 'all' : 'active';
  const canCreate = useCan('agreements:create');
  const canUpdate = useCan('agreements:update');
  const canDelete = useCan('agreements:delete');
  const [editing, setEditing] = useState<Agreement | 'new' | null>(null);
  const [ending, setEnding] = useState<Agreement | null>(null);
  const landlords = useLandlordOptions();
  const list = useAgreements({ landlordId: landlordId || undefined, active: show === 'active' ? true : undefined });

  return (
    <div className="pg">
      <div className="ad__filters">
        <select className="ad__select" aria-label="Landlord" value={landlordId} onChange={(e) => filters.setFilter({ landlordId: e.target.value })}>
          <option value="">All landlords</option>
          {(landlords.data?.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
        </select>
        <select className="ad__select" aria-label="Show" value={show} onChange={(e) => filters.setFilter({ show: e.target.value === 'all' ? 'all' : '' })}>
          <option value="active">Active only</option>
          <option value="all">Active and ended</option>
        </select>
        {canCreate ? <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setEditing('new')}>Add agreement</button> : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{agencyErrorMessage(list.error)}</p> : null}

      {list.isPending ? <p className="ad__muted" role="status">Loading…</p>
        : (list.data ?? []).length === 0 && !list.isError ? (
          <div className="ad__tablewrap">
            {landlordId || show === 'all'
              ? <EmptyState title="No agreements match" detail="Try another landlord, or show ended agreements too." onClear={() => filters.clear()} />
              : (
                <EmptyState title="No active agreements"
                  detail="An agreement sets the commission and remittance day for a landlord. Without one, their money is still recorded, but no commission is charged."
                  action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add agreement</button> : undefined} />
              )}
          </div>
        ) : (list.data ?? []).length > 0 ? (
          <AgreementsTable rows={list.data ?? []} canUpdate={canUpdate} canDelete={canDelete} onEdit={setEditing} onEnd={setEnding} />
        ) : null}

      {editing ? <AgreementSheet agreement={editing === 'new' ? undefined : editing} landlordId={editing === 'new' && landlordId ? landlordId : undefined} onClose={() => setEditing(null)} /> : null}
      {ending ? <EndAgreementSheet agreement={ending} onClose={() => setEnding(null)} /> : null}
    </div>
  );
}

export function AgreementsTable({ rows, canUpdate, canDelete, onEdit, onEnd, showLandlord = true }: {
  rows: Agreement[];
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (a: Agreement) => void;
  onEnd: (a: Agreement) => void;
  showLandlord?: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = todayInNairobi();
  const remove = useMutation({
    mutationFn: (a: Agreement) => api.delete(`/agreements/${a.id}`),
    onSuccess: async (_r, a) => {
      toast.saved(`The agreement with ${a.landlord.name} was deleted.`);
      await Promise.all([agencyKeys.agreements, agencyKeys.accounts].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    onError: (error) => toast.failed(agencyErrorMessage(error)),
  });

  return (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            {showLandlord ? <th>Landlord</th> : null}
            <th>Commission</th>
            <th>Collection</th>
            <th>Remittance day</th>
            <th>Dates</th>
            <th>Status</th>
            <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const state = agreementState(a, today);
            const endable = state !== 'ENDED' && (!a.endDate || a.endDate >= today);
            return (
              <tr key={a.id}>
                {showLandlord ? (
                  <td>
                    <Link className="ad__link" to={`/app/landlords/${a.landlord.id}`}><strong>{a.landlord.name}</strong></Link>
                    <span className="ad__sub">
                      <span className="num">{a.landlord.code}</span> · {a.propertyIds.length === 0 ? 'All properties' : `${a.propertyIds.length} ${a.propertyIds.length === 1 ? 'property' : 'properties'}`}
                    </span>
                  </td>
                ) : null}
                <td>
                  {describeRate(a)}
                  {a.commissionBasis !== 'FIXED_MONTHLY' ? (
                    <span className="ad__sub">On {a.commissionableLines.map((l) => (COMMISSIONABLE_LINE[l] ?? l).split(' (')[0].toLowerCase()).join(', ')}</span>
                  ) : null}
                </td>
                <td>
                  {COLLECTION_MODE[a.collection] ?? a.collection}
                  <span className="ad__sub">
                    {[a.deductExpenses ? 'Expenses deducted' : 'Expenses not deducted', a.holdDeposits ? 'deposits held' : 'deposits passed on'].join(' · ')}
                  </span>
                </td>
                <td>{ordinal(a.remittanceDay)} of the month</td>
                <td>
                  {formatDay(a.startDate.slice(0, 10))}
                  <span className="ad__sub">{a.endDate ? `to ${formatDay(a.endDate.slice(0, 10))}` : 'No end date'}</span>
                </td>
                <td><Badge table={AGREEMENT_STATE} value={state} /></td>
                <td className="ad__rowactions">
                  <div>
                    {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => onEdit(a)}>Edit</button> : null}
                    {canUpdate && endable ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => onEnd(a)}>End</button> : null}
                    {canDelete ? (
                      <ConfirmDelete what={`the agreement with ${a.landlord.name}`}
                        consequence="Only possible while nothing has been booked under it. Once money is recorded, end it instead."
                        busy={remove.isPending && remove.variables?.id === a.id} onConfirm={() => remove.mutate(a)} />
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
