import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatKES, minorToInput, parseAmount } from '../../lib/money';
import { currentPeriod, formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { OPTIONS_PAGE_SIZE, keys as portfolioKeys } from '../portfolio/api';
import { splitFormError } from '../portfolio/formErrors';
import { useForm, useListFilters } from '../portfolio/hooks';
import { RECORD_STATUS } from '../portfolio/labels';
import type { Unit } from '../portfolio/types';
import { Badge, CheckList, Field } from '../portfolio/ui';
import { billingErrorMessage, keys, useChargeTypes, useMoveInCharges } from './api';
import { ChargesCsvImportSheet } from './ChargesCsvImportSheet';
import { CHARGE_KIND, CHARGE_KIND_HINT, MOVE_IN_KIND } from './labels';
import { moveInChargeRule, splitRowErrors } from './rules';
import type { ChargeKind, ChargeType, MoveInCharge, MoveInKind, VariableGridRow } from './types';
import { MonthPicker, PropertySelect } from './ui';

/**
 * Charges (`/app/charges`): pick a property, then
 *  - Recurring: fixed, variable and metered charge types, and which units they apply to;
 *  - Move-in: deposits and fees billed once when a tenant moves in;
 *  - Variable amounts: this month's figure per unit for a variable charge, saved together.
 *
 * The property and tab live in the address, so a reload or a shared link lands here.
 */

type Tab = 'recurring' | 'move-in' | 'variable';
const TABS: { id: Tab; label: string }[] = [
  { id: 'recurring', label: 'Recurring charges' },
  { id: 'move-in', label: 'Move-in charges' },
  { id: 'variable', label: 'Variable amounts' },
];

export function ChargesPage() {
  const filters = useListFilters();
  const propertyId = filters.get('propertyId');
  const tabParam = filters.get('tab') as Tab;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'recurring';
  const canSeeProperties = useCan('properties:view');
  const canCreate = useCan('charges:create');
  const [importingCsv, setImportingCsv] = useState(false);

  return (
    <div className="pg">
      <div className="ad__filters">
        <PropertySelect value={propertyId} onChange={(id) => filters.setFilter({ propertyId: id })} />
        {propertyId ? (
          <div className="pf__tabs" role="tablist" aria-label="Charges">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="pf__tab"
                onClick={() => filters.setFilter({ tab: t.id === 'recurring' ? '' : t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        {canCreate && canSeeProperties ? (
          <button type="button" className="nx-btn pg-push" onClick={() => setImportingCsv(true)}>Import CSV</button>
        ) : null}
      </div>

      {!canSeeProperties ? (
        <div className="ad__tablewrap">
          <EmptyState title="Charges are set per property" detail="Your role cannot list properties, so it cannot open a property’s charges." />
        </div>
      ) : !propertyId ? (
        <div className="ad__tablewrap">
          <EmptyState title="Choose a property" detail="Charges belong to a property: rent is on the unit, and everything else billed each month is set up here." />
        </div>
      ) : tab === 'recurring' ? (
        <RecurringTab propertyId={propertyId} />
      ) : tab === 'move-in' ? (
        <MoveInTab propertyId={propertyId} />
      ) : (
        <VariableTab propertyId={propertyId} />
      )}

      {importingCsv ? (
        <ChargesCsvImportSheet defaultPropertyId={propertyId || undefined} onClose={() => setImportingCsv(false)} />
      ) : null}
    </div>
  );
}

/** A property's units, for "which units" and the variable grid's labels. */
function usePropertyUnits(propertyId: string, enabled = true) {
  return useQuery({
    queryKey: [...portfolioKeys.units, 'of-property', propertyId],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', { propertyId, pageSize: OPTIONS_PAGE_SIZE }),
    enabled: enabled && Boolean(propertyId),
    staleTime: 30_000,
  });
}

function chargeRate(charge: ChargeType): string {
  if (charge.kind === 'FIXED') return charge.amount !== null ? `${formatKES(charge.amount)} a month` : '—';
  if (charge.kind === 'METERED') return charge.unitRate !== null ? `${formatKES(charge.unitRate)} per ${charge.unitLabel || 'unit'}` : '—';
  return 'Entered each month';
}

// ---------------------------------------------------------------- recurring

function RecurringTab({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = useCan('charges:create');
  const canUpdate = useCan('charges:update');
  const canDelete = useCan('charges:delete');
  const charges = useChargeTypes({ propertyId });
  const [editing, setEditing] = useState<ChargeType | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (charge: ChargeType) => api.delete(`/charge-types/${charge.id}`),
    onSuccess: async (_r, charge) => {
      toast.saved(`${charge.name} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.chargeTypes });
    },
    onError: (error) => toast.failed(billingErrorMessage(error, {
      IN_USE: 'This charge has been billed or has meters, so it can’t be deleted. Mark it inactive instead.',
    })),
  });

  const rows = charges.data ?? [];

  return (
    <section>
      <div className="pf__sectionhead bl__tabhead">
        <p className="ad__muted pg-grow">Billed every month with rent, on each unit the charge applies to.</p>
        {canCreate ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setEditing('new')}>Add charge</button> : null}
      </div>

      {charges.isError ? <p className="ad__error" role="alert">{billingErrorMessage(charges.error)}</p>
        : charges.isPending ? <p className="ad__muted" role="status">Loading…</p>
          : rows.length === 0 ? (
            <div className="ad__tablewrap">
              <EmptyState title="No recurring charges" detail="Add garbage, service charge, water or power — anything billed monthly besides rent."
                action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add charge</button> : undefined} />
            </div>
          ) : (
            <div className="ad__tablewrap">
              <table className="ad__table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Kind</th>
                    <th>Amount</th>
                    <th>Units</th>
                    <th>Status</th>
                    <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong>{c.kind === 'METERED' ? <span className="ad__sub">{c.meterCount} {c.meterCount === 1 ? 'meter' : 'meters'}</span> : null}</td>
                      <td><Badge table={CHARGE_KIND} value={c.kind} /></td>
                      <td className="num">{chargeRate(c)}</td>
                      <td>{c.unitIds.length === 0 ? 'All units' : `${c.unitIds.length} ${c.unitIds.length === 1 ? 'unit' : 'units'}`}</td>
                      <td><Badge table={RECORD_STATUS} value={c.status} /></td>
                      <td className="ad__rowactions">
                        <div>
                          {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(c)}>Edit</button> : null}
                          {canDelete ? (
                            <ConfirmDelete what={c.name}
                              consequence="A charge that has been billed, or has meters, can’t be deleted — mark it inactive instead."
                              busy={remove.isPending && remove.variables?.id === c.id} onConfirm={() => remove.mutate(c)} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      {editing ? (
        <ChargeTypeSheet propertyId={propertyId} charge={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
}

const CHARGE_FIELDS = ['name', 'kind', 'amount', 'unitRate', 'unitLabel', 'unitIds', 'status'] as const;
type ChargeField = (typeof CHARGE_FIELDS)[number];

function ChargeTypeSheet({ propertyId, charge, onClose }: { propertyId: string; charge?: ChargeType; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSeeUnits = useCan('units:view');
  const units = usePropertyUnits(propertyId, canSeeUnits);
  const form = useForm<ChargeField>({
    name: charge?.name ?? '',
    kind: charge?.kind ?? 'FIXED',
    amount: charge?.amount != null ? minorToInput(charge.amount) : '',
    unitRate: charge?.unitRate != null ? minorToInput(charge.unitRate) : '',
    unitLabel: charge?.unitLabel ?? '',
    unitIds: '',
    status: charge?.status ?? 'ACTIVE',
  });
  const { values, errors, set } = form;
  const [limited, setLimited] = useState((charge?.unitIds.length ?? 0) > 0);
  const [unitIds, setUnitIds] = useState<string[]>(charge?.unitIds ?? []);
  const kind = values.kind as ChargeKind;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (charge
      ? api.patch<DataEnvelope<ChargeType>>(`/charge-types/${charge.id}`, body)
      : api.post<DataEnvelope<ChargeType>>('/charge-types', body)),
    onSuccess: async () => {
      toast.saved(`${values.name.trim()} was ${charge ? 'saved' : 'added'}.`);
      await queryClient.invalidateQueries({ queryKey: keys.chargeTypes });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: CHARGE_FIELDS, conflicts: { NAME_TAKEN: 'name' }, describe: (e) => billingErrorMessage(e),
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<ChargeField, string>> = {};
    if (!values.name.trim()) found.name = 'Name the charge, e.g. Garbage.';
    const amount = kind === 'FIXED' ? parseAmount(values.amount) : null;
    const rate = kind === 'METERED' ? parseAmount(values.unitRate) : null;
    if (amount && !amount.ok) found.amount = amount.error;
    if (rate && !rate.ok) found.unitRate = rate.error;
    if (limited && unitIds.length === 0) found.unitIds = 'Tick at least one unit, or choose All units.';
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const body: Record<string, unknown> = {
      name: values.name.trim(),
      unitIds: limited ? unitIds : [],
    };
    if (amount?.ok) body.amount = amount.minor;
    if (rate?.ok) {
      body.unitRate = rate.minor;
      body.unitLabel = values.unitLabel.trim() || (charge ? null : undefined);
    }
    if (charge) body.status = values.status;
    else {
      body.propertyId = propertyId;
      body.kind = kind;
    }
    save.mutate(body);
  };

  const unitRows = units.data?.data ?? [];

  return (
    <Sheet
      title={charge ? `Edit ${charge.name}` : 'Add a recurring charge'}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="charge-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : charge ? 'Save charge' : 'Add charge'}
          </button>
        </>
      )}
    >
      <form id="charge-form" className="sheet-form" onSubmit={submit} noValidate>
        <div className="fm__grid sheet-grid">
          <Field id="ch-name" label="Name" error={errors.name}>
            <input id="ch-name" value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Water"
              autoComplete="off" aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field id="ch-kind" label="Kind" error={errors.kind} hint={charge ? 'The kind can’t be changed once added.' : CHARGE_KIND_HINT[kind]}>
            <select id="ch-kind" value={values.kind} onChange={(e) => set('kind', e.target.value)} disabled={Boolean(charge)}>
              {(Object.keys(CHARGE_KIND) as ChargeKind[]).map((k) => <option key={k} value={k}>{CHARGE_KIND[k].label}</option>)}
            </select>
          </Field>
          {kind === 'FIXED' ? (
            <Field id="ch-amount" label="Monthly amount" error={errors.amount} hint="In KES, e.g. 300.">
              <input id="ch-amount" value={values.amount} onChange={(e) => set('amount', e.target.value)} inputMode="decimal"
                autoComplete="off" aria-invalid={Boolean(errors.amount)} />
            </Field>
          ) : null}
          {kind === 'METERED' ? (
            <>
              <Field id="ch-rate" label="Rate per unit" error={errors.unitRate} hint="KES for each unit used, e.g. 150 per m³.">
                <input id="ch-rate" value={values.unitRate} onChange={(e) => set('unitRate', e.target.value)} inputMode="decimal"
                  autoComplete="off" aria-invalid={Boolean(errors.unitRate)} />
              </Field>
              <Field id="ch-label" label="Unit of measure" error={errors.unitLabel} optional hint="Shown on invoices, e.g. m³ or kWh.">
                <input id="ch-label" value={values.unitLabel} onChange={(e) => set('unitLabel', e.target.value)} maxLength={12} autoComplete="off" />
              </Field>
            </>
          ) : null}
          {charge ? (
            <Field id="ch-status" label="Status" error={errors.status} hint="Inactive charges are not billed.">
              <select id="ch-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          ) : null}

          <div className={`fld fm__wide ${errors.unitIds ? 'is-bad' : ''}`}>
            <span className="fld__label">Applies to</span>
            <div className="pf__radios">
              <label className="fld__check"><input type="radio" name="ch-scope" checked={!limited} onChange={() => setLimited(false)} />All units</label>
              <label className="fld__check">
                <input type="radio" name="ch-scope" checked={limited} disabled={!canSeeUnits} onChange={() => setLimited(true)} />Only some units
              </label>
            </div>
            {limited ? (
              units.isPending ? <span className="hint">Loading units…</span>
                : units.isError ? <span className="fld__err">{billingErrorMessage(units.error)}</span>
                  : unitRows.length === 0 ? <span className="hint">This property has no units yet.</span>
                    : <CheckList name="Units" options={unitRows.map((u) => ({ id: u.id, label: u.number }))} value={unitIds} onChange={setUnitIds} />
            ) : null}
            {errors.unitIds ? <span className="fld__err">{errors.unitIds}</span> : null}
          </div>
        </div>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- move-in

function MoveInTab({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = useCan('charges:create');
  const canUpdate = useCan('charges:update');
  const canDelete = useCan('charges:delete');
  const charges = useMoveInCharges(propertyId);
  const [editing, setEditing] = useState<MoveInCharge | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (charge: MoveInCharge) => api.delete(`/move-in-charges/${charge.id}`),
    onSuccess: async (_r, charge) => {
      toast.saved(`${charge.name} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.moveInCharges });
    },
    onError: (error) => toast.failed(billingErrorMessage(error, {
      IN_USE: 'This charge is on a move-in invoice, so it can’t be deleted. Mark it inactive instead.',
    })),
  });

  const rows = charges.data ?? [];

  return (
    <section>
      <div className="pf__sectionhead bl__tabhead">
        <p className="ad__muted pg-grow">Billed once, on the move-in invoice. A deposit can be a number of months’ rent.</p>
        {canCreate ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setEditing('new')}>Add move-in charge</button> : null}
      </div>

      {charges.isError ? <p className="ad__error" role="alert">{billingErrorMessage(charges.error)}</p>
        : charges.isPending ? <p className="ad__muted" role="status">Loading…</p>
          : rows.length === 0 ? (
            <div className="ad__tablewrap">
              <EmptyState title="No move-in charges" detail="Add the deposit and any one-off fees new tenants pay, so moving someone in can bill them."
                action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add move-in charge</button> : undefined} />
            </div>
          ) : (
            <div className="ad__tablewrap">
              <table className="ad__table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Kind</th>
                    <th>Amount</th>
                    <th>Refundable</th>
                    <th>Status</th>
                    <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td><Badge table={MOVE_IN_KIND} value={c.kind} /></td>
                      <td className="num">{moveInChargeRule(c)}</td>
                      <td>{c.refundable ? 'Yes' : 'No'}</td>
                      <td><Badge table={RECORD_STATUS} value={c.status} /></td>
                      <td className="ad__rowactions">
                        <div>
                          {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(c)}>Edit</button> : null}
                          {canDelete ? (
                            <ConfirmDelete what={c.name} busy={remove.isPending && remove.variables?.id === c.id}
                              consequence="Invoices already issued keep their lines. New move-ins won’t include it."
                              onConfirm={() => remove.mutate(c)} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      {editing ? <MoveInChargeSheet propertyId={propertyId} charge={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

const MOVE_IN_FIELDS = ['name', 'kind', 'amount', 'rentMonths', 'refundable', 'status'] as const;
type MoveInField = (typeof MOVE_IN_FIELDS)[number];

function MoveInChargeSheet({ propertyId, charge, onClose }: { propertyId: string; charge?: MoveInCharge; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<MoveInField>({
    name: charge?.name ?? '',
    kind: charge?.kind ?? 'DEPOSIT',
    amount: charge?.amount != null ? minorToInput(charge.amount) : '',
    rentMonths: charge?.rentMonths != null ? String(charge.rentMonths) : '1',
    refundable: '',
    status: charge?.status ?? 'ACTIVE',
  });
  const { values, errors, set } = form;
  const [basis, setBasis] = useState<'rent' | 'fixed'>(charge ? (charge.amount != null ? 'fixed' : 'rent') : 'rent');
  const [refundable, setRefundable] = useState(charge?.refundable ?? true);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (charge
      ? api.patch<DataEnvelope<MoveInCharge>>(`/move-in-charges/${charge.id}`, body)
      : api.post<DataEnvelope<MoveInCharge>>('/move-in-charges', body)),
    onSuccess: async () => {
      toast.saved(`${values.name.trim()} was ${charge ? 'saved' : 'added'}.`);
      await queryClient.invalidateQueries({ queryKey: keys.moveInCharges });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: MOVE_IN_FIELDS, conflicts: { NAME_TAKEN: 'name' }, describe: (e) => billingErrorMessage(e),
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const chooseKind = (kind: string) => {
    set('kind', kind);
    if (!charge) {
      setRefundable(kind === 'DEPOSIT');
      if (kind === 'FEE') setBasis('fixed');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<MoveInField, string>> = {};
    if (!values.name.trim()) found.name = 'Name it, e.g. Deposit or Agreement fee.';
    const amount = basis === 'fixed' ? parseAmount(values.amount) : null;
    const months = basis === 'rent' ? values.rentMonths.trim() : '';
    if (amount && !amount.ok) found.amount = amount.error;
    if (basis === 'rent' && (!/^\d+$/.test(months) || Number(months) < 1 || Number(months) > 12)) {
      found.rentMonths = 'A whole number of months, 1 to 12.';
    }
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const body: Record<string, unknown> = {
      name: values.name.trim(),
      kind: values.kind as MoveInKind,
      refundable,
      // Exactly one of the two: the other is cleared on an edit.
      amount: amount?.ok ? amount.minor : (charge ? null : undefined),
      rentMonths: basis === 'rent' ? Number(months) : (charge ? null : undefined),
    };
    if (charge) body.status = values.status;
    else body.propertyId = propertyId;
    save.mutate(body);
  };

  return (
    <Sheet
      title={charge ? `Edit ${charge.name}` : 'Add a move-in charge'}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="movein-charge-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : charge ? 'Save' : 'Add'}
          </button>
        </>
      )}
    >
      <form id="movein-charge-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <Field id="mc-name" label="Name" error={errors.name}>
          <input id="mc-name" value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Deposit"
            autoComplete="off" aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field id="mc-kind" label="Kind" error={errors.kind}>
          <select id="mc-kind" value={values.kind} onChange={(e) => chooseKind(e.target.value)}>
            {(Object.keys(MOVE_IN_KIND) as MoveInKind[]).map((k) => <option key={k} value={k}>{MOVE_IN_KIND[k].label}</option>)}
          </select>
        </Field>
        <div className="fld">
          <span className="fld__label">Amount</span>
          <div className="pf__radios">
            <label className="fld__check"><input type="radio" name="mc-basis" checked={basis === 'rent'} onChange={() => setBasis('rent')} />Months of rent</label>
            <label className="fld__check"><input type="radio" name="mc-basis" checked={basis === 'fixed'} onChange={() => setBasis('fixed')} />Fixed amount</label>
          </div>
        </div>
        {basis === 'rent' ? (
          <Field id="mc-months" label="Months of rent" error={errors.rentMonths} hint="Worked out from each tenant’s own rent.">
            <input id="mc-months" value={values.rentMonths} onChange={(e) => set('rentMonths', e.target.value)} inputMode="numeric"
              autoComplete="off" aria-invalid={Boolean(errors.rentMonths)} />
          </Field>
        ) : (
          <Field id="mc-amount" label="Fixed amount" error={errors.amount} hint="In KES.">
            <input id="mc-amount" value={values.amount} onChange={(e) => set('amount', e.target.value)} inputMode="decimal"
              autoComplete="off" aria-invalid={Boolean(errors.amount)} />
          </Field>
        )}
        <label className="fld__check">
          <input type="checkbox" checked={refundable} onChange={(e) => setRefundable(e.target.checked)} />
          Refundable when the tenant moves out
        </label>
        {charge ? (
          <Field id="mc-status" label="Status" error={errors.status} hint="Inactive charges are left off new move-in invoices.">
            <select id="mc-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        ) : null}
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- variable amounts

function VariableTab({ propertyId }: { propertyId: string }) {
  const filters = useListFilters();
  const variable = useChargeTypes({ propertyId, kind: 'VARIABLE' });
  const choices = (variable.data ?? []).filter((c) => c.status === 'ACTIVE');
  const chosen = filters.get('chargeTypeId');
  const chargeTypeId = choices.some((c) => c.id === chosen) ? chosen : (choices[0]?.id ?? '');
  const period = filters.get('period') || currentPeriod();

  if (variable.isError) return <p className="ad__error" role="alert">{billingErrorMessage(variable.error)}</p>;
  if (variable.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (choices.length === 0) {
    return (
      <div className="ad__tablewrap">
        <EmptyState title="No variable charges" detail="Add a recurring charge of kind “Variable” first; its monthly amounts are entered here." />
      </div>
    );
  }

  return (
    <section>
      <div className="ad__filters">
        <select className="ad__select" aria-label="Variable charge" value={chargeTypeId}
          onChange={(e) => filters.setFilter({ chargeTypeId: e.target.value })}>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <MonthPicker value={period} onChange={(p) => filters.setFilter({ period: p })} />
      </div>
      <VariableGrid chargeTypeId={chargeTypeId} period={period} />
    </section>
  );
}

function VariableGrid({ chargeTypeId, period }: { chargeTypeId: string; period: string }) {
  const grid = useQuery({
    queryKey: [...keys.chargeEntries, { chargeTypeId, period }],
    queryFn: () => api.get<DataEnvelope<VariableGridRow[]>>('/charge-entries', { chargeTypeId, period }).then((r) => r.data),
  });

  if (grid.isError) return <p className="ad__error" role="alert">{billingErrorMessage(grid.error)}</p>;
  if (grid.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (grid.data.length === 0) {
    return <div className="ad__tablewrap"><EmptyState title="No units" detail="This charge applies to no units yet. Edit the charge to choose them." /></div>;
  }
  // Keyed on the fetch, so a refetch after saving starts the inputs afresh.
  return <VariableGridForm key={`${chargeTypeId}-${period}-${grid.dataUpdatedAt}`} chargeTypeId={chargeTypeId} period={period} rows={grid.data} />;
}

function VariableGridForm({ chargeTypeId, period, rows }: { chargeTypeId: string; period: string; rows: VariableGridRow[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('charges:update');
  const initial = Object.fromEntries(rows.map((r) => [r.unit.id, r.amount !== null ? minorToInput(r.amount) : '']));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const changed = rows.filter((r) => !r.billed && (values[r.unit.id] ?? '').trim() !== (initial[r.unit.id] ?? '').trim());

  const save = useMutation({
    mutationFn: (entries: { unitId: string; amount: number | null }[]) => api.put('/charge-entries', { chargeTypeId, period, entries }),
    onSuccess: async (_r, entries) => {
      toast.saved(`${entries.length} ${entries.length === 1 ? 'amount' : 'amounts'} saved for ${formatPeriod(period)}.`);
      await queryClient.invalidateQueries({ queryKey: keys.chargeEntries });
      await queryClient.invalidateQueries({ queryKey: keys.runPreview });
    },
    onError: (error, entries) => {
      const { byRow, general: message } = splitRowErrors(error, 'entries', entries.map((e) => e.unitId), (e) => billingErrorMessage(e));
      setErrors(byRow);
      setGeneral(message);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    const entries: { unitId: string; amount: number | null }[] = [];
    for (const row of changed) {
      const text = (values[row.unit.id] ?? '').trim();
      if (!text) { entries.push({ unitId: row.unit.id, amount: null }); continue; }
      const parsed = parseAmount(text);
      if (!parsed.ok) found[row.unit.id] = parsed.error;
      else entries.push({ unitId: row.unit.id, amount: parsed.minor });
    }
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0 || entries.length === 0) return;
    save.mutate(entries);
  };

  const total = rows.reduce((sum, r) => {
    const parsed = (values[r.unit.id] ?? '').trim() ? parseAmount(values[r.unit.id]) : null;
    return parsed?.ok ? sum + parsed.minor : sum;
  }, 0);

  return (
    <form onSubmit={submit} noValidate>
      <div className="ad__tablewrap">
        <table className="ad__table bl__grid">
          <thead>
            <tr><th>Unit</th><th className="num">Amount for {formatPeriod(period)}</th><th>State</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unit.id}>
                <td><strong>{r.unit.number}</strong></td>
                <td className="num">
                  <div className={`fld bl__cell ${errors[r.unit.id] ? 'is-bad' : ''}`}>
                    <input aria-label={`Amount for unit ${r.unit.number}`} value={values[r.unit.id] ?? ''} inputMode="decimal" autoComplete="off"
                      disabled={r.billed || !canUpdate || save.isPending} placeholder="No charge"
                      onChange={(e) => setValues((v) => ({ ...v, [r.unit.id]: e.target.value }))} aria-invalid={Boolean(errors[r.unit.id])} />
                    {errors[r.unit.id] ? <span className="fld__err">{errors[r.unit.id]}</span> : null}
                  </div>
                </td>
                <td>{r.billed ? <span className="ad__badge ad__badge--off">Billed</span> : <span className="ad__muted">Open</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th>Total</th><th className="num">{formatKES(total)}</th><th /></tr>
          </tfoot>
        </table>
      </div>
      {general ? <p className="ad__error pg-gap" role="alert">{general}</p> : null}
      {canUpdate ? (
        <div className="pg-actions pg-gap">
          <span className="ad__muted pg-grow">Leave a unit blank for no charge this month. Billed amounts are locked until their invoice is voided.</span>
          <button type="button" className="nx-btn" disabled={changed.length === 0 || save.isPending}
            onClick={() => { setValues(initial); setErrors({}); setGeneral(null); }}>Discard</button>
          <button type="submit" className="nx-btn nx-btn--primary" disabled={changed.length === 0 || save.isPending}>
            {save.isPending ? 'Saving…' : changed.length > 0 ? `Save ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}` : 'Save'}
          </button>
        </div>
      ) : <p className="ad__muted pg-gap">Your role can view these amounts but not change them.</p>}
    </form>
  );
}
