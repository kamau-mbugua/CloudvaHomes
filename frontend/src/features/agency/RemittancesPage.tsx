import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime, todayInNairobi } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { currentPeriod, formatPeriod, isPeriod } from '../../lib/periods';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { MonthPicker } from '../billing/ui';
import { SignedAmount } from '../payments/ui';
import { unwrap } from '../payments/rules';
import { useLandlordOptions } from '../portfolio/api';
import { useListFilters } from '../portfolio/hooks';
import { Badge, Field } from '../portfolio/ui';
import { agencyErrorMessage, agencyKeys, downloadBulkPaymentFile, useRemittances } from './api';
import { REMITTANCE_DIRECTION, REMITTANCE_STATUS } from './labels';
import { bulkSelectable } from './rules';
import type { Remittance, RemittanceStatus } from './types';

/**
 * Remittances (`/app/remittances`): payouts of net collections to landlords, by status,
 * with "Draft remittance" (landlord + month). Each opens its detail page, where it is
 * approved, marked paid or cancelled.
 *
 * Phase 10: with `remittances:pay`, approved remittances to landlords paid by bank can be
 * ticked and downloaded as one bulk-payment CSV for internet banking (it asks for a
 * verification code: the file holds bank details). Each is then marked paid once the
 * bank confirms.
 */

const STATUS_TABS: { id: '' | RemittanceStatus; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'SENDING', label: 'Sending' },
  { id: 'PAID', label: 'Paid' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

export function RemittancesPage() {
  const filters = useListFilters();
  const status = filters.get('status');
  const landlordId = filters.get('landlordId');
  const period = isPeriod(filters.get('period')) ? filters.get('period') : '';
  const canCreate = useCan('remittances:create');
  const canPay = useCan('remittances:pay');
  const toast = useToast();
  const [drafting, setDrafting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState<number | null>(null);
  const landlords = useLandlordOptions();
  const list = useRemittances({ status: status || undefined, landlordId: landlordId || undefined, period: period || undefined, page: filters.page });
  const rows = list.data?.data ?? [];
  const filtered = Boolean(status || landlordId || period);
  const selectable = canPay ? rows.filter(bulkSelectable) : [];

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const download = async () => {
    setDownloading(true);
    try {
      await downloadBulkPaymentFile([...selected], todayInNairobi());
      setDownloaded(selected.size);
      setSelected(new Set());
    } catch (error) {
      toast.failed(agencyErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

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

      {selected.size > 0 ? (
        <div className="ad__callout bk__bulkbar">
          <p><strong>{selected.size}</strong> bank remittance{selected.size === 1 ? '' : 's'} ticked.</p>
          <div className="bl__headbtns">
            <button type="button" className="nx-btn nx-btn--sm" onClick={() => setSelected(new Set())} disabled={downloading}>Clear</button>
            <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => void download()} disabled={downloading}>
              {downloading ? 'Preparing…' : 'Download bulk-payment file'}
            </button>
          </div>
        </div>
      ) : null}
      {downloaded !== null && selected.size === 0 ? (
        <div className="ad__callout ad__callout--info bk__bulkdone" role="status">
          <p>
            The bulk-payment file for {downloaded} remittance{downloaded === 1 ? '' : 's'} was downloaded. Upload it to your internet banking.
            Nothing is marked paid yet: once the bank confirms, open each remittance and mark it paid with the bank’s reference.
          </p>
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => setDownloaded(null)}>OK</button>
        </div>
      ) : null}
      {selectable.length > 0 && selected.size === 0 && downloaded === null ? (
        <p className="hint bk__bulkhint">Paying landlords by bank? Tick approved remittances to download one bulk-payment file for your internet banking.</p>
      ) : null}

      {list.isPending ? <TableSkeleton />
        : rows.length === 0 && !list.isError ? (
          <div className="ad__tablewrap">
            {filtered ? <EmptyState title="No remittances match" detail="Try another status, landlord or month." onClear={() => filters.clear()} />
              : <EmptyState title="No remittances yet" detail="They are drafted each month on the agreement’s remittance day, or by hand with Draft remittance." />}
          </div>
        ) : rows.length > 0 ? (
          <RemittancesTable rows={rows} selection={selectable.length > 0 || selected.size > 0 ? { selected, toggle, canTick: (r) => canPay && bulkSelectable(r) } : undefined} />
        ) : null}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
      {drafting ? <DraftRemittanceSheet landlordId={landlordId} onClose={() => setDrafting(false)} /> : null}
    </div>
  );
}

interface Selection {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  canTick: (r: Remittance) => boolean;
}

function RemittancesTable({ rows, selection }: { rows: Remittance[]; selection?: Selection }) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            {selection ? <th className="bk__tick"><span className="nx-sr">Include in the bulk-payment file</span></th> : null}
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
              {selection ? (
                <td className="bk__tick">
                  {selection.canTick(r) ? (
                    <input type="checkbox" checked={selection.selected.has(r.id)} onChange={() => selection.toggle(r.id)}
                      aria-label={`Include ${r.number} in the bulk-payment file`} />
                  ) : null}
                </td>
              ) : null}
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
