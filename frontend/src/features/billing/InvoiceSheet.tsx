import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, isDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { keys as portfolioKeys } from '../portfolio/api';
import { useDebounced } from '../portfolio/hooks';
import { TENANCY_STATUS, labelFor, personName } from '../portfolio/labels';
import type { Tenancy } from '../portfolio/types';
import { Field } from '../portfolio/ui';
import { AFTER_INVOICE_KEYS, billingErrorMessage, useChargeTypes } from './api';
import { MAX_ADHOC_LINES, addChargeLine, chargeOptionLabel, chargesForUnit, checkAdhocLines, draftTotal, splitRowErrors } from './rules';
import type { DraftLine } from './rules';
import type { Invoice } from './types';

/**
 * A one-off invoice (`POST /invoices`, kind ADHOC) — repairs, penalties, damages after a
 * move-out, or an extra/missed property charge picked from Billing → Charges. Pick a tenancy
 * (ended ones too), add 1–20 description/amount lines and, optionally, a due date; otherwise
 * the organisation's "due after N days" applies.
 */

type PickedTenancy = Pick<Tenancy, 'id' | 'status' | 'startDate' | 'endDate' | 'tenant'> & {
  unit: { id: string; number: string; property: { id: string; name: string } };
};

const EMPTY_LINE: DraftLine = { description: '', amount: '' };

export function InvoiceSheet({ tenancy, onClose }: { tenancy?: PickedTenancy; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSearch = useCan('tenancies:view');
  const canSeeCharges = useCan('charges:view');
  const [picked, setPicked] = useState<PickedTenancy | null>(tenancy ?? null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [lineErrors, setLineErrors] = useState<{ description?: string; amount?: string; row?: string }[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<{ tenancyId?: string; dueDate?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const today = todayInNairobi();

  const tenancies = useQuery({
    queryKey: [...portfolioKeys.tenancies, 'search', term],
    queryFn: () => api.get<PageEnvelope<Tenancy>>('/tenancies', { q: term, pageSize: 8 }),
    enabled: !tenancy && canSearch,
  });

  const create = useMutation({
    // `rows`: the draft row each sent line came from (blank rows are skipped), so a 422 on
    // `lines.2.amount` lands beside the right row.
    mutationFn: ({ body }: { body: Record<string, unknown>; rows: number[] }) => api.post<DataEnvelope<Invoice>>('/invoices', body),
    onSuccess: async (result) => {
      const inv = result?.data;
      toast.saved(inv ? `Invoice ${inv.number} was issued for ${formatKES(inv.total)}.` : 'The invoice was issued.');
      await Promise.all(AFTER_INVOICE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
      if (inv?.id) navigate(`/app/invoices/${inv.id}`);
    },
    onError: (error, { rows: sent }) => {
      const { byRow, byField, general: message } = splitRowErrors(
        error, 'lines', sent.map(String), (e) => billingErrorMessage(e), ['tenancyId', 'dueDate'],
      );
      setLineErrors(lines.map((_l, i) => (byRow[String(i)] ? { row: byRow[String(i)] } : {})));
      setErrors(byField);
      setGeneral(message);
    },
  });

  const setLine = (index: number, change: Partial<DraftLine>) => setLines((all) => all.map((l, i) => (i === index ? { ...l, ...change } : l)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: { tenancyId?: string; dueDate?: string } = {};
    if (!picked) found.tenancyId = 'Find and choose the tenancy to bill.';
    if (dueDate && !isDay(dueDate)) found.dueDate = 'Choose a date.';
    else if (dueDate && dueDate < today) found.dueDate = 'The due date can’t be in the past.';
    const checked = checkAdhocLines(lines);
    setErrors(found);
    setLineErrors(checked.ok ? [] : checked.errors);
    setGeneral(checked.ok ? null : checked.general ?? null);
    if (!checked.ok || Object.keys(found).length > 0 || !picked) return;

    create.mutate({
      body: { tenancyId: picked.id, lines: checked.lines, dueDate: dueDate || undefined },
      rows: lines.flatMap((l, i) => (l.description.trim() || l.amount.trim() ? [i] : [])),
    });
  };

  const charges = useChargeTypes({ propertyId: picked?.unit.property.id, status: 'ACTIVE' }, canSeeCharges && Boolean(picked));
  const pickable = chargesForUnit(charges.data ?? [], picked?.unit.id);
  const chargeName = new Map(pickable.map((c) => [c.id, c.name]));

  const rows = tenancies.data?.data ?? [];
  const total = draftTotal(lines);

  return (
    <Sheet
      title="New one-off invoice"
      wide
      busy={create.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={create.isPending}>Cancel</button>
          <button type="submit" form="adhoc-form" className="nx-btn nx-btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Issuing…' : `Issue invoice · ${formatKES(total)}`}
          </button>
        </>
      )}
    >
      <form id="adhoc-form" className="sheet-form" onSubmit={submit} noValidate>
        <div className={`fld ${errors.tenancyId ? 'is-bad' : ''}`}>
          <span className="fld__label">Tenancy</span>
          {tenancy ? (
            <input aria-label="Tenancy" disabled value={`${personName(tenancy.tenant)} · ${tenancy.unit.number}, ${tenancy.unit.property.name}`} />
          ) : !canSearch ? (
            <p className="ad__muted">Your role cannot look up tenancies. Open the invoice from a tenant’s page instead.</p>
          ) : (
            <>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
                placeholder="Search by tenant name, phone or unit" aria-label="Search tenancies" />
              <div className="pf__results" role="listbox" aria-label="Tenancies">
                {rows.map((t) => (
                  <button key={t.id} type="button" role="option" aria-selected={picked?.id === t.id}
                    className={`pf__result ${picked?.id === t.id ? 'is-on' : ''}`} onClick={() => setPicked(t)}>
                    <strong>{personName(t.tenant)}</strong>
                    <span>
                      {t.unit.number}, {t.unit.property.name} · {labelFor(TENANCY_STATUS, t.status).label}
                      {t.endDate && t.status === 'ENDED' ? ` ${formatDay(t.endDate)}` : ''}
                    </span>
                  </button>
                ))}
                {tenancies.isSuccess && rows.length === 0 ? <span className="hint">No tenancies match.</span> : null}
                {tenancies.isError ? <span className="fld__err">{billingErrorMessage(tenancies.error)}</span> : null}
              </div>
            </>
          )}
          {errors.tenancyId ? <span className="fld__err">{errors.tenancyId}</span> : null}
        </div>

        <div className="bl__lines" role="group" aria-label="Lines">
          <span className="fld__label">Lines</span>
          {pickable.length > 0 ? (
            <div className="fld">
              <select aria-label="Add a property charge" value="" disabled={lines.length >= MAX_ADHOC_LINES && lines.every((l) => l.description.trim() || l.amount.trim())}
                onChange={(e) => {
                  const c = pickable.find((x) => x.id === e.target.value);
                  if (c) setLines((all) => addChargeLine(all, c));
                }}>
                <option value="">Add a charge from {picked?.unit.property.name}…</option>
                {pickable.map((c) => <option key={c.id} value={c.id}>{chargeOptionLabel(c)}</option>)}
              </select>
              <span className="hint">Monthly charges are added by the invoice run. Pick one here for an extra or missed charge.</span>
            </div>
          ) : null}
          {lines.map((line, i) => {
            const err = lineErrors[i] ?? {};
            return (
              <div key={i} className="bl__line">
                <div className={`fld bl__linedesc ${err.description ? 'is-bad' : ''}`}>
                  <input aria-label={`Line ${i + 1} description`} value={line.description} placeholder="e.g. Broken window repair"
                    maxLength={200} autoComplete="off" onChange={(e) => setLine(i, { description: e.target.value })} aria-invalid={Boolean(err.description)} />
                  {err.description ? <span className="fld__err">{err.description}</span> : null}
                  {line.chargeTypeId && chargeName.has(line.chargeTypeId) ? (
                    <span className="hint">Charge: {chargeName.get(line.chargeTypeId)}</span>
                  ) : null}
                </div>
                <div className={`fld bl__lineamt ${err.amount ? 'is-bad' : ''}`}>
                  <input aria-label={`Line ${i + 1} amount`} value={line.amount} placeholder="Amount" inputMode="decimal" autoComplete="off"
                    onChange={(e) => setLine(i, { amount: e.target.value })} aria-invalid={Boolean(err.amount)} />
                  {err.amount ? <span className="fld__err">{err.amount}</span> : null}
                </div>
                <button type="button" className="nx-btn nx-btn--sm" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1}
                  onClick={() => { setLines((all) => all.filter((_l, j) => j !== i)); setLineErrors((all) => all.filter((_e, j) => j !== i)); }}>
                  ×
                </button>
                {err.row ? <span className="fld__err bl__lineerr">{err.row}</span> : null}
              </div>
            );
          })}
          <div className="bl__linefoot">
            <button type="button" className="nx-btn nx-btn--sm" disabled={lines.length >= MAX_ADHOC_LINES}
              onClick={() => setLines((all) => [...all, { ...EMPTY_LINE }])}>Add line</button>
            <span className="num"><span className="ad__muted">Total </span>{formatKES(total)}</span>
          </div>
        </div>

        <div className="fm__grid sheet-grid">
          <Field id="ah-due" label="Due date" optional error={errors.dueDate} hint="Blank uses your organisation’s “invoice due after” setting.">
            <input id="ah-due" type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-invalid={Boolean(errors.dueDate)} />
          </Field>
        </div>

        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
