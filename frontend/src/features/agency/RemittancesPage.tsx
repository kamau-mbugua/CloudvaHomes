import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { currentPeriod, formatPeriod, isPeriod } from '../../lib/periods';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { MonthPicker } from '../billing/ui';
import { SignedAmount } from '../payments/ui';
import { unwrap } from '../payments/rules';
import { useLandlordOptions } from '../portfolio/api';
import { useListFilters } from '../portfolio/hooks';
import { Badge, Field } from '../portfolio/ui';
import { agencyErrorMessage, agencyKeys, useRemittances } from './api';
import { REMITTANCE_DIRECTION, REMITTANCE_STATUS } from './labels';
import type { Remittance, RemittanceStatus } from './types';

/**
 * Remittances (`/app/remittances`): payouts of net collections to landlords, by status,
 * with "Draft remittance" (landlord + month). Each opens its detail page, where it is
 * approved, marked paid or cancelled.
 */

const STATUS_TABS: { id: '' | RemittanceStatus; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PAID', label: 'Paid' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

export function RemittancesPage() {
  const filters = useListFilters();
  const status = filters.get('status');
  const landlordId = filters.get('landlordId');
  const period = isPeriod(filters.get('period')) ? filters.get('period') : '';
  const canCreate = useCan('remittances:create');
  const [drafting, setDrafting] = useState(false);
  const landlords = useLandlordOptions();
  const list = useRemittances({ status: status || undefined, landlordId: landlordId || undefined, period: period || undefined, page: filters.page });
  const rows = list.data?.data ?? [];
  const filtered = Boolean(status || landlordId || period);

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Status">
          {STATUS_TABS.map((t) => (
            <button key={t.id || 'all'} type="button" role="tab" aria-selected={status === t.id} className="pf__tab"
              onClick={() => filters.setFilter({ status: t.id })}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="ad__filters">
        <select className="ad__select" aria-label="Landlord" value={landlordId} onChange={(e) => filters.setFilter({ landlordId: e.target.value })}>
          <option value="">All landlords</option>
          {(landlords.data?.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
        </select>
        {period ? (
          <>
            <MonthPicker label="Month" value={period} max={currentPeriod()} onChange={(p) => filters.setFilter({ period: p })} />
            <button type="button" className="nx-btn nx-btn--sm" onClick={() => filters.setFilter({ period: '' })}>Any month</button>
          </>
        ) : (
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => filters.setFilter({ period: currentPeriod() })}>Pick a month</button>
        )}
        {canCreate ? <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setDrafting(true)}>Draft remittance</button> : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{agencyErrorMessage(list.error)}</p> : null}

      {list.isPending ? <p className="ad__muted" role="status">Loading…</p>
        : rows.length === 0 && !list.isError ? (
          <div className="ad__tablewrap">
            {filtered ? <EmptyState title="No remittances match" detail="Try another status, landlord or month." onClear={() => filters.clear()} />
              : <EmptyState title="No remittances yet" detail="They are drafted each month on the agreement’s remittance day, or by hand with Draft remittance." />}
          </div>
        ) : rows.length > 0 ? <RemittancesTable rows={rows} /> : null}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
      {drafting ? <DraftRemittanceSheet landlordId={landlordId} onClose={() => setDrafting(false)} /> : null}
    </div>
  );
}

function RemittancesTable({ rows }: { rows: Remittance[] }) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            <th>Remittance</th>
            <th>Landlord</th>
            <th>Month</th>
            <th>Direction</th>
            <th className="num">Net</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className="ad__link" to={`/app/remittances/${r.id}`}><strong className="num">{r.number}</strong></Link>
                <span className="ad__sub">Drafted {formatDateTime(r.createdAt)}</span>
              </td>
              <td>{r.landlord.name}<span className="ad__sub num">{r.landlord.code}</span></td>
              <td>{formatPeriod(r.period)}</td>
              <td>{REMITTANCE_DIRECTION[r.direction] ?? r.direction}</td>
              <td className="num"><SignedAmount minor={r.net} /></td>
              <td><Badge table={REMITTANCE_STATUS} value={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Draft a remittance for a landlord and month: net = their payable balance now. */
function DraftRemittanceSheet({ landlordId, onClose }: { landlordId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const landlords = useLandlordOptions();
  const [chosen, setChosen] = useState(landlordId);
  const [period, setPeriod] = useState(currentPeriod());
  const [error, setError] = useState<string | null>(null);

  const draft = useMutation({
    mutationFn: () => api.post<unknown>('/remittances', { landlordId: chosen, period }),
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: agencyKeys.remittances });
      const created = unwrap<Remittance | undefined>(body);
      onClose();
      if (created?.id) navigate(`/app/remittances/${created.id}`);
    },
    onError: (e) => setError(agencyErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!chosen) { setError('Choose the landlord.'); return; }
    setError(null);
    draft.mutate();
  };

  return (
    <Sheet
      title="Draft remittance"
      busy={draft.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={draft.isPending}>Cancel</button>
          <button type="submit" form="draft-remittance" className="nx-btn nx-btn--primary" disabled={draft.isPending}>
            {draft.isPending ? 'Drafting…' : 'Draft remittance'}
          </button>
        </>
      )}
    >
      <form id="draft-remittance" className="pf__dialogform" onSubmit={submit} noValidate>
        <p>
          The amount is the landlord’s payable balance right now, with what was collected, deducted and adjusted since their
          last remittance. Someone other than you then approves it before it’s paid.
        </p>
        <Field id="rm-landlord" label="Landlord">
          <select id="rm-landlord" value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">{landlords.isPending ? 'Loading…' : 'Choose a landlord…'}</option>
            {(landlords.data?.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
          </select>
        </Field>
        <div className="fld">
          <span className="fld__label">Month</span>
          <MonthPicker label="Month" value={period} max={currentPeriod()} onChange={setPeriod} />
        </div>
        {error ? <p className="nx-sheet__error" role="alert">{error}</p> : null}
      </form>
    </Sheet>
  );
}
