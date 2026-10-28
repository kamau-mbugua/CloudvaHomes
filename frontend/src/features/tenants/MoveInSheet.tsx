import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { isDay, todayInNairobi } from '../../lib/dates';
import { formatKES, minorToInput, parseAmount } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import {
  OCCUPANCY_KEYS, OPTIONS_PAGE_SIZE, keys, portfolioErrorMessage, usePropertyOptions,
} from '../portfolio/api';
import { splitFormError } from '../portfolio/formErrors';
import { defaultBillingDay, personName, unitLabel } from '../portfolio/labels';
import type { CodedRef, Tenancy, Tenant, TenantRef, Unit } from '../portfolio/types';
import { optional } from '../portfolio/forms';
import { useDebounced, useForm } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';
import { AFTER_INVOICE_KEYS, useMoveInCharges } from '../billing/api';
import { MoveInChargeList } from '../billing/MoveInCharges';
import { activeMoveInCharges } from '../billing/rules';

/**
 * Move a tenant into a unit — `POST /tenancies` in one call, with either an existing
 * tenant or a new one typed in here.
 *
 * Opened from a vacant unit (unit fixed), from a tenant (tenant fixed) or from the
 * tenancies list (both picked here). Rent starts as the unit's rent; the billing day
 * follows the start date (capped at 28) until someone changes it by hand. The opening
 * deposit is for tenants who already paid one before Hodi.
 *
 * When the unit's property has active move-in charges, "Issue move-in invoice" (on by
 * default) bills them in the same step, each charge shown with what it comes to for the
 * rent entered. Without `invoices:create` it is hidden and `issueMoveInInvoice: false` is
 * sent, so the server's default cannot bill on this person's behalf.
 */

const FIELDS = [
  'propertyId', 'unitId', 'tenantId', 'rentAmount', 'billingDay', 'startDate', 'depositHeld',
  'firstName', 'lastName', 'phone', 'email', 'idNumber',
] as const;
type MoveInField = (typeof FIELDS)[number];

type UnitChoice = { id: string; number: string; rentAmount: number; property: CodedRef };

export function MoveInSheet({
  unit,
  tenant,
  onClose,
}: {
  unit?: UnitChoice;
  tenant?: TenantRef;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSearchTenants = useCan('tenants:view');
  const canCreateTenant = useCan('tenants:create');
  const canPickProperty = useCan('properties:view');
  const canInvoice = useCan('invoices:create');
  const canSeeCharges = useCan('charges:view');
  const [issueInvoice, setIssueInvoice] = useState(true);

  const today = todayInNairobi();
  const form = useForm<MoveInField>({
    propertyId: '',
    unitId: unit?.id ?? '',
    tenantId: tenant?.id ?? '',
    rentAmount: unit ? minorToInput(unit.rentAmount) : '',
    billingDay: String(defaultBillingDay(today) ?? 1),
    startDate: today,
    depositHeld: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    idNumber: '',
  });
  const { values, errors, set } = form;
  const [billingTouched, setBillingTouched] = useState(false);
  const [chosenMode, setMode] = useState<'existing' | 'new'>(canSearchTenants || !canCreateTenant ? 'existing' : 'new');
  // A tenant passed in is always "existing", whatever this person could otherwise choose.
  const mode = tenant ? 'existing' : chosenMode;
  const [picked, setPicked] = useState<TenantRef | null>(tenant ?? null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());

  // ---- unit choice (when not fixed): vacant, active units, optionally in one property
  const properties = usePropertyOptions(!unit && canPickProperty);
  const vacant = useQuery({
    queryKey: [...keys.units, 'vacant', values.propertyId],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', {
      occupancy: 'VACANT', status: 'ACTIVE', propertyId: values.propertyId, pageSize: OPTIONS_PAGE_SIZE,
    }),
    enabled: !unit,
  });
  const vacantRows = vacant.data?.data ?? [];

  // ---- move-in charges of the chosen unit's property
  const chargePropertyId = unit?.property.id ?? vacantRows.find((u) => u.id === values.unitId)?.property.id ?? '';
  const moveInCharges = useMoveInCharges(chargePropertyId, canInvoice && canSeeCharges);
  const activeCharges = activeMoveInCharges(moveInCharges.data ?? []);
  const offerInvoice = canInvoice && canSeeCharges && Boolean(chargePropertyId) && activeCharges.length > 0;
  const rentPreview = parseAmount(values.rentAmount);

  // ---- tenant search (when not fixed)
  const tenants = useQuery({
    queryKey: [...keys.tenants, 'search', term],
    queryFn: () => api.get<PageEnvelope<Tenant>>('/tenants', { q: term, pageSize: 8 }),
    enabled: !tenant && mode === 'existing' && canSearchTenants,
  });

  const chooseUnit = (unitId: string) => {
    set('unitId', unitId);
    const chosen = vacantRows.find((u) => u.id === unitId);
    if (chosen) set('rentAmount', minorToInput(chosen.rentAmount));
  };

  const chooseStart = (startDate: string) => {
    set('startDate', startDate);
    if (!billingTouched) {
      const day = defaultBillingDay(startDate);
      if (day) set('billingDay', String(day));
    }
  };

  const moveIn = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<DataEnvelope<Tenancy>>('/tenancies', body),
    onSuccess: async (result) => {
      const t = result.data;
      const billed = offerInvoice && issueInvoice ? ' A move-in invoice was issued.' : '';
      toast.saved(t ? `${personName(t.tenant)} moved into ${unitLabel(t.unit)}.${billed}` : `Moved in.${billed}`);
      await Promise.all([...OCCUPANCY_KEYS, ...AFTER_INVOICE_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: FIELDS,
        prefix: 'tenant.',
        conflicts: { PHONE_TAKEN: 'phone', ID_NUMBER_TAKEN: 'idNumber' },
        describe: portfolioErrorMessage,
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<MoveInField, string>> = {};
    const rent = parseAmount(values.rentAmount);
    const deposit = values.depositHeld.trim() ? parseAmount(values.depositHeld) : null;
    const billingDay = Number(values.billingDay);

    if (!values.unitId) found.unitId = 'Choose a vacant unit.';
    if (mode === 'existing' && !picked) found.tenantId = 'Find and choose the tenant.';
    if (mode === 'new') {
      if (!values.firstName.trim()) found.firstName = 'Required.';
      if (!values.lastName.trim()) found.lastName = 'Required.';
      if (!values.phone.trim()) found.phone = 'Required — it is how they will pay and sign in.';
    }
    if (!rent.ok) found.rentAmount = rent.error;
    if (!/^\d+$/.test(values.billingDay) || billingDay < 1 || billingDay > 28) found.billingDay = 'A day from 1 to 28.';
    if (!isDay(values.startDate)) found.startDate = 'Choose the move-in date.';
    if (deposit && !deposit.ok) found.depositHeld = deposit.error;
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0 || !rent.ok) return;

    const body: Record<string, unknown> = {
      unitId: values.unitId,
      rentAmount: rent.minor,
      billingDay,
      startDate: values.startDate,
    };
    if (deposit?.ok) body.depositHeld = deposit.minor;
    if (!canInvoice) body.issueMoveInInvoice = false;
    else if (offerInvoice) body.issueMoveInInvoice = issueInvoice;
    // Otherwise (no charges, or charges this role can't list) the server's default applies.
    if (mode === 'existing' && picked) body.tenantId = picked.id;
    else {
      body.tenant = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim(),
        email: optional(values.email),
        idNumber: optional(values.idNumber),
      };
    }
    moveIn.mutate(body);
  };

  const input = (name: MoveInField, label: string, props: Record<string, string | boolean> = {}, opt = false) => (
    <Field id={`mi-${name}`} label={label} error={errors[name]} optional={opt}>
      <input id={`mi-${name}`} value={values[name]} onChange={(e) => set(name, e.target.value)}
        autoComplete="off" aria-invalid={Boolean(errors[name])} {...props} />
    </Field>
  );

  const tenantRows = tenants.data?.data ?? [];
  const canChooseMode = !tenant && canSearchTenants && canCreateTenant;

  return (
    <Sheet
      title="Move in"
      wide
      busy={moveIn.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={moveIn.isPending}>Cancel</button>
          <button type="submit" form="movein-form" className="nx-btn nx-btn--primary" disabled={moveIn.isPending}>
            {moveIn.isPending ? 'Saving…' : 'Move in'}
          </button>
        </>
      )}
    >
      <form id="movein-form" className="sheet-form" onSubmit={submit} noValidate>
        {/* ---- unit */}
        <div className="fm__grid sheet-grid">
          {unit ? (
            <Field id="mi-unit" label="Unit">
              <input id="mi-unit" value={unitLabel(unit)} disabled />
            </Field>
          ) : (
            <>
              {canPickProperty ? (
                <Field id="mi-propertyId" label="Property" error={errors.propertyId}>
                  <select id="mi-propertyId" value={values.propertyId}
                    onChange={(e) => { set('propertyId', e.target.value); set('unitId', ''); }}>
                    <option value="">All properties</option>
                    {(properties.data?.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              ) : null}
              <Field
                id="mi-unitId"
                label="Vacant unit"
                error={errors.unitId ?? (vacant.isError ? portfolioErrorMessage(vacant.error) : undefined)}
                hint={vacant.isSuccess && vacantRows.length === 0 ? 'No vacant, active units here.'
                  : (vacant.data?.meta.total ?? 0) > vacantRows.length ? `Showing the first ${vacantRows.length}; choose a property to narrow the list.` : undefined}
              >
                <select id="mi-unitId" value={values.unitId} onChange={(e) => chooseUnit(e.target.value)} aria-invalid={Boolean(errors.unitId)}>
                  <option value="">{vacant.isPending ? 'Loading…' : 'Choose a unit…'}</option>
                  {vacantRows.map((u) => (
                    <option key={u.id} value={u.id}>{unitLabel(u)} — {formatKES(u.rentAmount)}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>

        {/* ---- tenant */}
        <div className="pf__sectionhead">
          <span className="fld__label">Tenant</span>
          {canChooseMode ? (
            <div className="pf__tabs" role="tablist" aria-label="Tenant">
              <button type="button" role="tab" aria-selected={mode === 'existing'} className="pf__tab" onClick={() => setMode('existing')}>Existing tenant</button>
              <button type="button" role="tab" aria-selected={mode === 'new'} className="pf__tab" onClick={() => setMode('new')}>New tenant</button>
            </div>
          ) : null}
        </div>

        {tenant ? (
          <div className="fld">
            <input aria-label="Tenant" value={`${personName(tenant)} · ${tenant.code} · ${tenant.phone}`} disabled />
          </div>
        ) : mode === 'existing' ? (
          canSearchTenants ? (
            <div className={`fld ${errors.tenantId ? 'is-bad' : ''}`}>
              <input id="mi-tenant-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone or code" aria-label="Search tenants" autoComplete="off" />
              {tenants.isError ? <span className="fld__err">{portfolioErrorMessage(tenants.error)}</span> : null}
              <div className="pf__results" role="listbox" aria-label="Tenants">
                {tenantRows.map((t) => (
                  <button key={t.id} type="button" role="option" aria-selected={picked?.id === t.id}
                    className={`pf__result ${picked?.id === t.id ? 'is-on' : ''}`}
                    onClick={() => setPicked(t)}>
                    <strong>{personName(t)}</strong>
                    <span className="num">{t.code} · {t.phone}</span>
                  </button>
                ))}
                {tenants.isSuccess && tenantRows.length === 0 ? (
                  <span className="hint">
                    No tenants match{canCreateTenant ? ' — use “New tenant” to register them.' : '.'}
                  </span>
                ) : null}
              </div>
              {errors.tenantId ? <span className="fld__err">{errors.tenantId}</span> : null}
            </div>
          ) : (
            <p className="ad__muted">Your role cannot look up or register tenants, so it cannot move anyone in.</p>
          )
        ) : (
          <div className="fm__grid sheet-grid">
            {input('firstName', 'First name')}
            {input('lastName', 'Last name')}
            {input('phone', 'Phone', { type: 'tel', inputMode: 'tel', placeholder: '0712 345 678' })}
            {input('email', 'Email', { type: 'email' }, true)}
            {input('idNumber', 'ID number', {}, true)}
          </div>
        )}

        {/* ---- terms */}
        <div className="fm__grid sheet-grid">
          <Field id="mi-startDate" label="Move-in date" error={errors.startDate}>
            <input id="mi-startDate" type="date" value={values.startDate} onChange={(e) => chooseStart(e.target.value)}
              aria-invalid={Boolean(errors.startDate)} />
          </Field>
          <Field id="mi-billingDay" label="Billing day" error={errors.billingDay} hint="Rent falls due on this day each month (1–28).">
            <input id="mi-billingDay" value={values.billingDay} inputMode="numeric" autoComplete="off"
              onChange={(e) => { setBillingTouched(true); set('billingDay', e.target.value); }}
              aria-invalid={Boolean(errors.billingDay)} />
          </Field>
          <Field id="mi-rentAmount" label="Monthly rent" error={errors.rentAmount} hint="Defaults to the unit’s rent.">
            <input id="mi-rentAmount" value={values.rentAmount} onChange={(e) => set('rentAmount', e.target.value)}
              inputMode="decimal" autoComplete="off" aria-invalid={Boolean(errors.rentAmount)} />
          </Field>
          <Field id="mi-depositHeld" label="Deposit already held" error={errors.depositHeld} optional
            hint="Only for a deposit paid before Hodi. Leave blank for a new let.">
            <input id="mi-depositHeld" value={values.depositHeld} onChange={(e) => set('depositHeld', e.target.value)}
              inputMode="decimal" autoComplete="off" aria-invalid={Boolean(errors.depositHeld)} />
          </Field>
        </div>

        {offerInvoice ? (
          <div className="bl__movein">
            <label className="fld__check">
              <input type="checkbox" checked={issueInvoice} onChange={(e) => setIssueInvoice(e.target.checked)} />
              Issue move-in invoice
            </label>
            {issueInvoice ? (
              <MoveInChargeList charges={activeCharges} rentMinor={rentPreview.ok ? rentPreview.minor : null} />
            ) : (
              <span className="hint">You can issue it later from the tenancy’s actions.</span>
            )}
          </div>
        ) : null}

        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
