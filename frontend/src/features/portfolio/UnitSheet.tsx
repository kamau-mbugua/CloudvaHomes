import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { minorToInput, parseAmount } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { keys, portfolioErrorMessage, useCatalogue, usePropertyOptions } from './api';
import { splitFormError } from './formErrors';
import type { CodedRef, Unit } from './types';
import { MAX_BULK_UNITS, buildUnitNumbers } from './unitNumbers';
import { nullable, optional, wholeNumber } from './forms';
import { useForm } from './hooks';
import { CheckList, Field } from './ui';

/**
 * Add one unit, add several at once, or edit a unit.
 *
 * "Several" builds the numbers from a prefix and a range and shows them before saving.
 * The API adds the whole batch or none of it: one clash (`409 NUMBER_TAKEN`) and nothing
 * is created, with the clashing numbers listed.
 *
 * A unit's rent is the default for new tenancies; changing it does not change the rent of
 * anyone already living there (their tenancy keeps its own).
 */

const FIELDS = [
  'propertyId', 'number', 'prefix', 'from', 'to', 'floor', 'sizeSqft', 'rentAmount',
  'unitTypeId', 'categoryId', 'featureIds', 'description', 'status', 'numbers',
] as const;
type UnitField = (typeof FIELDS)[number];

export function UnitSheet({
  unit,
  property,
  allowBulk = false,
  onClose,
}: {
  unit?: Unit;
  /** Fixes the property (adding from a property page). */
  property?: CodedRef;
  /** Offer "Several units" beside "One unit". */
  allowBulk?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [bulk, setBulk] = useState(false);
  const fixedProperty = unit?.property ?? property;
  const properties = usePropertyOptions(!fixedProperty);
  const types = useCatalogue('unit-types');
  const categories = useCatalogue('unit-categories');
  const features = useCatalogue('unit-features');

  const form = useForm<UnitField>({
    propertyId: fixedProperty?.id ?? '',
    number: unit?.number ?? '',
    prefix: '',
    from: '1',
    to: '10',
    floor: unit?.floor != null ? String(unit.floor) : '',
    sizeSqft: unit?.sizeSqft != null ? String(unit.sizeSqft) : '',
    rentAmount: unit ? minorToInput(unit.rentAmount) : '',
    unitTypeId: unit?.unitType?.id ?? '',
    categoryId: unit?.category?.id ?? '',
    featureIds: '',
    description: unit?.description ?? '',
    status: unit?.status ?? 'ACTIVE',
    numbers: '',
  });
  const { values, errors, set } = form;
  const [featureIds, setFeatureIds] = useState<string[]>(unit?.features.map((f) => f.id) ?? []);

  const range = useMemo(
    () => buildUnitNumbers({ prefix: values.prefix, from: values.from, to: values.to }),
    [values.prefix, values.from, values.to],
  );

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (unit) return api.patch<DataEnvelope<Unit>>(`/units/${unit.id}`, body);
      if (bulk) return api.post<DataEnvelope<{ created: number }> | { created: number }>('/units/bulk', body);
      return api.post<DataEnvelope<Unit>>('/units', body);
    },
    onSuccess: async (result) => {
      if (unit) toast.saved(`Unit ${values.number.trim()} was saved.`);
      else if (bulk) {
        // The contract shows `{ created: n }`; accept it with or without the data envelope.
        const payload = result as { data?: { created?: number }; created?: number };
        const created = payload.data?.created ?? payload.created ?? (range.ok ? range.numbers.length : 0);
        toast.saved(`${created} ${created === 1 ? 'unit was' : 'units were'} added.`);
      } else toast.saved(`Unit ${values.number.trim()} was added.`);
      await queryClient.invalidateQueries({ queryKey: keys.units });
      await queryClient.invalidateQueries({ queryKey: keys.properties });
      onClose();
    },
    onError: (error) => {
      // In bulk the clashes arrive as details; list them rather than pin them on a field.
      if (bulk && error instanceof ApiError && error.code === 'NUMBER_TAKEN') {
        // The server's message already lists the clashing numbers in the order given.
        form.setErrors({});
        form.setGeneral(`Nothing was added. ${error.message}.`);
        return;
      }
      const { fieldErrors, general } = splitFormError(error, {
        fields: FIELDS,
        conflicts: { NUMBER_TAKEN: 'number' },
        describe: portfolioErrorMessage,
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<UnitField, string>> = {};
    const rent = parseAmount(values.rentAmount);
    const floor = wholeNumber(values.floor);
    const size = wholeNumber(values.sizeSqft);
    if (!values.propertyId) found.propertyId = 'Choose the property.';
    if (bulk) {
      if (!range.ok) found.to = range.error;
    } else if (!values.number.trim()) found.number = 'Give the unit a number, e.g. A4.';
    if (!rent.ok) found.rentAmount = rent.error;
    if (Number.isNaN(floor)) found.floor = 'A whole number (0 for the ground floor).';
    if (!bulk && Number.isNaN(size)) found.sizeSqft = 'A whole number of square feet.';
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0 || !rent.ok) return;

    if (unit) {
      save.mutate({
        number: values.number.trim(),
        floor,
        sizeSqft: size,
        rentAmount: rent.minor,
        unitTypeId: values.unitTypeId || null,
        categoryId: values.categoryId || null,
        featureIds,
        description: nullable(values.description),
        status: values.status,
      });
      return;
    }

    const shared = {
      propertyId: values.propertyId,
      floor: floor ?? undefined,
      rentAmount: rent.minor,
      unitTypeId: values.unitTypeId || undefined,
      categoryId: values.categoryId || undefined,
      featureIds: featureIds.length > 0 ? featureIds : undefined,
    };
    if (bulk && range.ok) {
      save.mutate({ ...shared, numbers: range.numbers });
    } else {
      save.mutate({
        ...shared,
        number: values.number.trim(),
        sizeSqft: size ?? undefined,
        description: optional(values.description),
      });
    }
  };

  const catalogueSelect = (
    name: 'unitTypeId' | 'categoryId',
    label: string,
    query: typeof types,
    current: { id: string; name: string } | null | undefined,
  ) => {
    const rows = query.data ?? [];
    return (
      <Field id={`un-${name}`} label={label} error={errors[name] ?? (query.isError ? portfolioErrorMessage(query.error) : undefined)} optional>
        <select id={`un-${name}`} value={values[name]} onChange={(e) => set(name, e.target.value)}>
          <option value="">{query.isPending ? 'Loading…' : 'None'}</option>
          {current && !rows.some((r) => r.id === current.id) ? <option value={current.id}>{current.name}</option> : null}
          {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
    );
  };

  const propertyRows = properties.data?.data ?? [];
  const count = range.ok ? range.numbers.length : 0;
  const title = unit ? `Edit unit ${unit.number}` : bulk ? 'Add several units' : 'Add a unit';

  return (
    <Sheet
      title={title}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="unit-form" className="nx-btn nx-btn--primary" disabled={save.isPending || (bulk && !range.ok)}>
            {save.isPending ? 'Saving…' : unit ? 'Save unit' : bulk ? `Add ${count} ${count === 1 ? 'unit' : 'units'}` : 'Add unit'}
          </button>
        </>
      )}
    >
      <form id="unit-form" className="sheet-form" onSubmit={submit} noValidate>
        {allowBulk && !unit ? (
          <div className="pf__tabs" role="tablist" aria-label="How many units">
            <button type="button" role="tab" aria-selected={!bulk} className="pf__tab" onClick={() => setBulk(false)}>One unit</button>
            <button type="button" role="tab" aria-selected={bulk} className="pf__tab" onClick={() => setBulk(true)}>Several units</button>
          </div>
        ) : null}

        <div className="fm__grid sheet-grid">
          {fixedProperty ? (
            <Field id="un-property" label="Property">
              <input id="un-property" value={`${fixedProperty.name} (${fixedProperty.code})`} disabled />
            </Field>
          ) : (
            <Field id="un-property" label="Property"
              error={errors.propertyId ?? (properties.isError ? portfolioErrorMessage(properties.error) : undefined)}>
              <select id="un-property" value={values.propertyId} onChange={(e) => set('propertyId', e.target.value)}
                aria-invalid={Boolean(errors.propertyId)}>
                <option value="">{properties.isPending ? 'Loading…' : 'Choose a property…'}</option>
                {propertyRows.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </Field>
          )}

          {bulk ? (
            <>
              <Field id="un-prefix" label="Prefix" error={errors.prefix} optional hint="Put before every number, e.g. A or B-.">
                <input id="un-prefix" value={values.prefix} onChange={(e) => set('prefix', e.target.value)} autoComplete="off" maxLength={10} />
              </Field>
              <Field id="un-from" label="From" error={errors.from} hint="Leading zeros set the width: 01 → A01.">
                <input id="un-from" value={values.from} onChange={(e) => set('from', e.target.value)} inputMode="numeric" autoComplete="off" />
              </Field>
              <Field id="un-to" label="To" error={errors.to}>
                <input id="un-to" value={values.to} onChange={(e) => set('to', e.target.value)} inputMode="numeric" autoComplete="off" />
              </Field>
              <div className="fld fm__wide">
                <span className="hint" id="un-preview-label">
                  {range.ok ? `${count} ${count === 1 ? 'unit' : 'units'} (at most ${MAX_BULK_UNITS} at a time):` : range.error}
                </span>
                {range.ok ? (
                  <div className="pf__preview" aria-labelledby="un-preview-label">
                    {range.numbers.map((n) => <span key={n} className="pf__chip">{n}</span>)}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <Field id="un-number" label="Unit number" error={errors.number}>
              <input id="un-number" value={values.number} onChange={(e) => set('number', e.target.value)}
                placeholder="e.g. A4" autoComplete="off" aria-invalid={Boolean(errors.number)} />
            </Field>
          )}

          <Field id="un-rent" label={bulk ? 'Monthly rent (each)' : 'Monthly rent'} error={errors.rentAmount}
            hint={unit ? 'The default for new tenancies. Current tenants keep their own rent.' : 'In KES, e.g. 25,000.'}>
            <input id="un-rent" value={values.rentAmount} onChange={(e) => set('rentAmount', e.target.value)}
              inputMode="decimal" autoComplete="off" placeholder="25,000" aria-invalid={Boolean(errors.rentAmount)} />
          </Field>
          <Field id="un-floor" label="Floor" error={errors.floor} optional>
            <input id="un-floor" value={values.floor} onChange={(e) => set('floor', e.target.value)} inputMode="numeric" autoComplete="off" />
          </Field>
          {!bulk ? (
            <Field id="un-size" label="Size (sq ft)" error={errors.sizeSqft} optional>
              <input id="un-size" value={values.sizeSqft} onChange={(e) => set('sizeSqft', e.target.value)} inputMode="numeric" autoComplete="off" />
            </Field>
          ) : null}
          {catalogueSelect('unitTypeId', 'Type', types, unit?.unitType)}
          {catalogueSelect('categoryId', 'Category', categories, unit?.category)}

          <div className={`fld fm__wide ${errors.featureIds ? 'is-bad' : ''}`}>
            <span className="fld__label" id="un-features-label">Features <span className="nx-muted">(optional)</span></span>
            {features.isPending ? <span className="hint">Loading…</span>
              : features.isError ? <span className="fld__err">{portfolioErrorMessage(features.error)}</span>
                : (features.data ?? []).length === 0 ? <span className="hint">No features set up yet — add them under Unit setup.</span>
                  : (
                    <CheckList
                      name="Features"
                      options={(features.data ?? []).map((f) => ({ id: f.id, label: f.name }))}
                      value={featureIds}
                      onChange={setFeatureIds}
                    />
                  )}
            {errors.featureIds ? <span className="fld__err">{errors.featureIds}</span> : null}
          </div>

          {!bulk ? (
            <Field id="un-desc" label="Description" error={errors.description} optional wide>
              <textarea id="un-desc" value={values.description} onChange={(e) => set('description', e.target.value)} rows={2} />
            </Field>
          ) : null}

          {unit ? (
            <Field id="un-status" label="Status" error={errors.status} hint="An occupied unit can’t be made inactive.">
              <select id="un-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          ) : null}
        </div>

        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
