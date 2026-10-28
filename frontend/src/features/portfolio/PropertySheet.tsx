import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { keys, portfolioErrorMessage, useLandlordOptions } from './api';
import { splitFormError } from './formErrors';
import type { Property } from './types';
import { nullable, optional, wholeNumber } from './forms';
import { useForm } from './hooks';
import { Field } from './ui';

/**
 * Add or edit a property. In an agency every property names its landlord (the API
 * requires it); a landlord's own organisation has no landlord picker at all (the API
 * rejects one).
 */

const FIELDS = ['name', 'code', 'location', 'county', 'floors', 'landlordId', 'status'] as const;
type PropertyField = (typeof FIELDS)[number];

export function PropertySheet({
  property,
  landlordId,
  onClose,
  onSaved,
}: {
  property?: Property;
  /** Pre-selects the landlord when adding from a landlord's page. */
  landlordId?: string;
  onClose: () => void;
  onSaved?: (property: Property) => void;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const isAgency = session.activeOrganization?.kind === 'AGENCY';
  const landlords = useLandlordOptions(isAgency);

  const form = useForm<PropertyField>({
    name: property?.name ?? '',
    code: property?.code ?? '',
    location: property?.location ?? '',
    county: property?.county ?? '',
    floors: property?.floors != null ? String(property.floors) : '',
    landlordId: property?.landlord?.id ?? landlordId ?? '',
    status: property?.status ?? 'ACTIVE',
  });
  const { values, errors, set } = form;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (property
      ? api.patch<DataEnvelope<Property>>(`/properties/${property.id}`, body)
      : api.post<DataEnvelope<Property>>('/properties', body)),
    onSuccess: async (result) => {
      toast.saved(property ? `${values.name.trim()} was saved.` : `${values.name.trim()} was added.`);
      await queryClient.invalidateQueries({ queryKey: keys.properties });
      // Landlord property counts and unit rows show the property's name.
      await queryClient.invalidateQueries({ queryKey: keys.landlords });
      await queryClient.invalidateQueries({ queryKey: keys.units });
      onSaved?.(result.data);
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: FIELDS,
        conflicts: { CODE_TAKEN: 'code' },
        describe: portfolioErrorMessage,
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<PropertyField, string>> = {};
    const code = values.code.trim().toUpperCase();
    const floors = wholeNumber(values.floors);
    if (!values.name.trim()) found.name = 'Give the property a name.';
    if (!/^[A-Z0-9]{2,10}$/.test(code)) found.code = '2 to 10 letters or digits, e.g. KIL or BLK2.';
    if (Number.isNaN(floors)) found.floors = 'A whole number.';
    if (isAgency && !values.landlordId) found.landlordId = 'Choose the landlord who owns it.';
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const body: Record<string, unknown> = property
      ? {
          name: values.name.trim(),
          code,
          location: nullable(values.location),
          county: nullable(values.county),
          floors,
          status: values.status,
        }
      : {
          name: values.name.trim(),
          code,
          location: optional(values.location),
          county: optional(values.county),
          floors: floors ?? undefined,
        };
    if (isAgency) body.landlordId = values.landlordId;
    save.mutate(body);
  };

  const landlordRows = landlords.data?.data ?? [];

  return (
    <Sheet
      title={property ? `Edit ${property.name}` : 'Add property'}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="property-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : property ? 'Save property' : 'Add property'}
          </button>
        </>
      )}
    >
      <form id="property-form" className="sheet-form" onSubmit={submit} noValidate>
        <div className="fm__grid sheet-grid">
          <Field id="pr-name" label="Name" error={errors.name} wide>
            <input id="pr-name" value={values.name} onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Sample Court" autoComplete="off" aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field id="pr-code" label="Code" error={errors.code} hint="Short and unique. Paybill account numbers will use it.">
            <input id="pr-code" value={values.code} onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="e.g. SMP" autoComplete="off" maxLength={10} aria-invalid={Boolean(errors.code)} />
          </Field>
          <Field id="pr-floors" label="Floors" error={errors.floors} optional>
            <input id="pr-floors" value={values.floors} onChange={(e) => set('floors', e.target.value)}
              inputMode="numeric" autoComplete="off" aria-invalid={Boolean(errors.floors)} />
          </Field>
          <Field id="pr-location" label="Location" error={errors.location} optional>
            <input id="pr-location" value={values.location} onChange={(e) => set('location', e.target.value)}
              placeholder="Street or area" autoComplete="off" />
          </Field>
          <Field id="pr-county" label="County" error={errors.county} optional>
            <input id="pr-county" value={values.county} onChange={(e) => set('county', e.target.value)} autoComplete="off" />
          </Field>

          {isAgency ? (
            <Field
              id="pr-landlord"
              label="Landlord"
              wide
              error={errors.landlordId ?? (landlords.isError ? portfolioErrorMessage(landlords.error) : undefined)}
              hint={landlords.isSuccess && landlordRows.length === 0
                ? <>No landlords yet. <Link to="/app/landlords">Add one first</Link>.</>
                : undefined}
            >
              <select id="pr-landlord" value={values.landlordId} onChange={(e) => set('landlordId', e.target.value)}
                aria-invalid={Boolean(errors.landlordId)}>
                <option value="">{landlords.isPending ? 'Loading…' : 'Choose a landlord…'}</option>
                {/* Keep the current landlord selectable even if it is beyond the first page. */}
                {property?.landlord && !landlordRows.some((l) => l.id === property.landlord?.id) ? (
                  <option value={property.landlord.id}>{property.landlord.name} ({property.landlord.code})</option>
                ) : null}
                {landlordRows.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
              </select>
            </Field>
          ) : null}

          {property ? (
            <Field id="pr-status" label="Status" error={errors.status} hint="Inactive properties stay in history and reports.">
              <select id="pr-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
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
