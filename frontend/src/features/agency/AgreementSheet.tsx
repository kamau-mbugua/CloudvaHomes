import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { keys as portfolioKeys, useLandlordOptions } from '../portfolio/api';
import type { Property } from '../portfolio/types';
import { CheckList, Field } from '../portfolio/ui';
import { AFTER_LEDGER_KEYS, agencyErrorMessage, agencyKeys } from './api';
import { COLLECTION_MODE, COMMISSIONABLE_LINE, COMMISSION_BASIS } from './labels';
import { agreementToDraft, checkAgreement, checkEndDate, newAgreementDraft } from './rules';
import type { AgreementDraft, AgreementField } from './rules';
import type { Agreement, CollectionMode, CommissionBasis, CommissionableLine } from './types';

/**
 * Add or edit a management agreement. Terms only change while nothing has been booked
 * under the agreement; after that the server answers AGREEMENT_IN_USE and the way to new
 * terms is "End agreement" plus a new one, so past statements never change.
 */
export function AgreementSheet({ agreement, landlordId, onClose }: { agreement?: Agreement; landlordId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = todayInNairobi();
  const canSeeProperties = useCan('properties:view');
  const [draft, setDraft] = useState<AgreementDraft>(() => (agreement ? agreementToDraft(agreement) : newAgreementDraft(today, landlordId)));
  const [errors, setErrors] = useState<Partial<Record<AgreementField, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const landlords = useLandlordOptions(!agreement && !landlordId);
  const properties = useQuery({
    queryKey: [...portfolioKeys.properties, { landlordId: draft.landlordId, pageSize: 100 }],
    queryFn: () => api.get<PageEnvelope<Property>>('/properties', { landlordId: draft.landlordId, pageSize: 100 }),
    enabled: canSeeProperties && Boolean(draft.landlordId),
  });

  const set = <K extends keyof AgreementDraft>(key: K, value: AgreementDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (agreement
      ? api.patch<unknown>(`/agreements/${agreement.id}`, body)
      : api.post<unknown>('/agreements', body)),
    onSuccess: async () => {
      toast.saved(agreement ? 'The agreement was saved.' : 'The agreement was added.');
      await Promise.all([agencyKeys.agreements, agencyKeys.accounts].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        const found: Partial<Record<AgreementField, string>> = {};
        const rest: string[] = [];
        for (const d of error.details) {
          const field = d.field === 'commissionBps' ? 'rate' : d.field;
          if (field in draft || field === 'rate') found[field as AgreementField] = d.message;
          else rest.push(d.message);
        }
        setErrors(found);
        setGeneral(rest.length > 0 || error.details.length === 0 ? [error.message, ...rest].join(' ') : null);
        return;
      }
      setGeneral(agencyErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkAgreement(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    // On edit, the API clears an end date with "" (null means "leave it").
    save.mutate(agreement ? { ...checked.body, endDate: checked.body.endDate ?? '' } : { ...checked.body });
  };

  const percent = draft.commissionBasis !== 'FIXED_MONTHLY';
  const propertyRows = properties.data?.data ?? [];

  return (
    <Sheet
      wide
      title={agreement ? `Edit agreement · ${agreement.landlord.name}` : 'Add management agreement'}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="agreement-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : agreement ? 'Save agreement' : 'Add agreement'}
          </button>
        </>
      )}
    >
      <form id="agreement-form" className="sheet-form" onSubmit={submit} noValidate>
        {agreement ? (
          <p className="hint">Terms can only be changed until money is booked under this agreement. After that, end it and add a new one.</p>
        ) : null}

        {!agreement && !landlordId ? (
          <Field id="ag-landlord" label="Landlord" error={errors.landlordId}>
            <select id="ag-landlord" value={draft.landlordId} onChange={(e) => setDraft((d) => ({ ...d, landlordId: e.target.value, propertyIds: [] }))}
              aria-invalid={Boolean(errors.landlordId)}>
              <option value="">{landlords.isPending ? 'Loading…' : 'Choose a landlord…'}</option>
              {(landlords.data?.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
            </select>
          </Field>
        ) : null}

        <div className={`fld ${errors.propertyIds ? 'is-bad' : ''}`}>
          <span className="fld__label">Covers</span>
          <div className="pf__radios" role="radiogroup" aria-label="Covers">
            <label className="fld__check">
              <input type="radio" name="ag-scope" checked={draft.scope === 'ALL'} onChange={() => set('scope', 'ALL')} /> All their properties
            </label>
            <label className="fld__check">
              <input type="radio" name="ag-scope" checked={draft.scope === 'SOME'} onChange={() => set('scope', 'SOME')} disabled={!canSeeProperties} /> Only some
            </label>
          </div>
          {draft.scope === 'SOME' ? (
            !draft.landlordId ? <span className="hint">Choose the landlord first.</span>
              : properties.isPending ? <span className="hint">Loading properties…</span>
                : propertyRows.length === 0 ? <span className="hint">This landlord has no properties yet.</span>
                  : (
                    <CheckList name="Properties" value={draft.propertyIds} onChange={(ids) => set('propertyIds', ids)}
                      options={propertyRows.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }))} />
                  )
          ) : <span className="hint">Properties added for this landlord later are covered too.</span>}
          {errors.propertyIds ? <span className="fld__err">{errors.propertyIds}</span> : null}
        </div>

        <div className="fm__grid sheet-grid">
          <Field id="ag-basis" label="Commission" error={errors.commissionBasis}>
            <select id="ag-basis" value={draft.commissionBasis} onChange={(e) => set('commissionBasis', e.target.value as CommissionBasis)}>
              {(Object.keys(COMMISSION_BASIS) as CommissionBasis[]).map((b) => <option key={b} value={b}>{COMMISSION_BASIS[b]}</option>)}
            </select>
          </Field>
          {percent ? (
            <Field id="ag-rate" label="Rate (%)" error={errors.rate} hint="e.g. 10 or 7.5">
              <input id="ag-rate" inputMode="decimal" value={draft.rate} onChange={(e) => set('rate', e.target.value)} aria-invalid={Boolean(errors.rate)} />
            </Field>
          ) : (
            <Field id="ag-fixed" label="Fee per month (KES)" error={errors.fixedAmount} hint="Booked when the month’s remittance is drafted.">
              <input id="ag-fixed" inputMode="decimal" value={draft.fixedAmount} onChange={(e) => set('fixedAmount', e.target.value)} aria-invalid={Boolean(errors.fixedAmount)} />
            </Field>
          )}
        </div>

        {percent ? (
          <div className={`fld ${errors.commissionableLines ? 'is-bad' : ''}`}>
            <span className="fld__label">Charged on</span>
            <CheckList name="Charged on" value={draft.commissionableLines}
              onChange={(ids) => set('commissionableLines', ids as CommissionableLine[])}
              options={(Object.keys(COMMISSIONABLE_LINE) as CommissionableLine[]).map((k) => ({ id: k, label: COMMISSIONABLE_LINE[k] }))} />
            {errors.commissionableLines ? <span className="fld__err">{errors.commissionableLines}</span>
              : <span className="hint">Deposits are never commissioned.</span>}
          </div>
        ) : null}

        <div className="fld">
          <span className="fld__label">Who collects the rent</span>
          <div className="pf__radios" role="radiogroup" aria-label="Who collects the rent">
            {(Object.keys(COLLECTION_MODE) as CollectionMode[]).map((m) => (
              <label key={m} className="fld__check">
                <input type="radio" name="ag-collection" checked={draft.collection === m} onChange={() => set('collection', m)} /> {COLLECTION_MODE[m]}
              </label>
            ))}
          </div>
          {draft.collection === 'LANDLORD_COLLECTS' ? (
            <span className="hint">The agency holds none of the money, so commission and expenses add up to what the landlord owes the agency.</span>
          ) : null}
        </div>

        <div className="fm__grid sheet-grid">
          <Field id="ag-day" label="Remittance day" error={errors.remittanceDay} hint="Day of the month the payout is drafted (1–28).">
            <input id="ag-day" inputMode="numeric" value={draft.remittanceDay} onChange={(e) => set('remittanceDay', e.target.value)} aria-invalid={Boolean(errors.remittanceDay)} />
          </Field>
          <Field id="ag-start" label="Starts" error={errors.startDate}>
            <input id="ag-start" type="date" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} aria-invalid={Boolean(errors.startDate)} />
          </Field>
          <Field id="ag-end" label="Ends" error={errors.endDate} optional>
            <input id="ag-end" type="date" min={draft.startDate || undefined} value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} aria-invalid={Boolean(errors.endDate)} />
          </Field>
        </div>

        <div className="fld">
          <label className="fld__check">
            <input type="checkbox" checked={draft.deductExpenses} onChange={(e) => set('deductExpenses', e.target.checked)} />
            Deduct property expenses the agency pays from the payout
          </label>
          <label className="fld__check">
            <input type="checkbox" checked={draft.holdDeposits} onChange={(e) => set('holdDeposits', e.target.checked)} />
            The agency holds tenants’ deposits (not paid out to the landlord)
          </label>
        </div>

        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

/** "End agreement": sets the end date (PATCH `{ endDate }`), which is allowed even once money is booked. */
export function EndAgreementSheet({ agreement, onClose }: { agreement: Agreement; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = todayInNairobi();
  const [endDate, setEndDate] = useState(agreement.startDate.slice(0, 10) > today ? agreement.startDate.slice(0, 10) : today);
  const [error, setError] = useState<string | null>(null);

  const end = useMutation({
    mutationFn: () => api.patch<unknown>(`/agreements/${agreement.id}`, { endDate }),
    onSuccess: async () => {
      toast.saved(`The agreement with ${agreement.landlord.name} ends on ${formatDay(endDate)}.`);
      await Promise.all([agencyKeys.agreements, ...AFTER_LEDGER_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (e) => setError(agencyErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = checkEndDate(endDate, agreement);
    setError(problem);
    if (!problem) end.mutate();
  };

  return (
    <Sheet
      title={`End the agreement with ${agreement.landlord.name}?`}
      busy={end.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={end.isPending}>Keep it</button>
          <button type="submit" form="end-agreement" className="nx-btn nx-btn--primary" disabled={end.isPending}>
            {end.isPending ? 'Ending…' : 'End agreement'}
          </button>
        </>
      )}
    >
      <form id="end-agreement" className="pf__dialogform" onSubmit={submit} noValidate>
        <p>
          Money received after this day is still recorded for the landlord, but without commission until a new agreement
          starts. To change terms, add the new agreement from the next day.
        </p>
        <Field id="ag-enddate" label="Last day of the agreement" error={error ?? undefined}>
          <input id="ag-enddate" type="date" min={agreement.startDate.slice(0, 10)} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
