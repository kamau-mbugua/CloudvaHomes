import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { keys, portfolioErrorMessage } from '../portfolio/api';
import { splitFormError } from '../portfolio/formErrors';
import type { Landlord } from '../portfolio/types';
import { nullable, optional } from '../portfolio/forms';
import { useForm } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';

/**
 * Add or edit a landlord (agencies only). As with tenants, the ID number is encrypted and
 * never returned in full: when editing, an empty box keeps the number on file.
 */

const FIELDS = ['name', 'kind', 'phone', 'email', 'idNumber', 'kraPin', 'status'] as const;
type LandlordField = (typeof FIELDS)[number];

export function LandlordSheet({ landlord, onClose }: { landlord?: Landlord; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<LandlordField>({
    name: landlord?.name ?? '',
    kind: landlord?.kind ?? 'INDIVIDUAL',
    phone: landlord?.phone ?? '',
    email: landlord?.email ?? '',
    idNumber: '',
    kraPin: landlord?.kraPin ?? '',
    status: landlord?.status ?? 'ACTIVE',
  });
  const { values, errors, set } = form;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (landlord
      ? api.patch<DataEnvelope<Landlord>>(`/landlords/${landlord.id}`, body)
      : api.post<DataEnvelope<Landlord>>('/landlords', body)),
    onSuccess: async () => {
      toast.saved(landlord ? `${values.name.trim()} was saved.` : `${values.name.trim()} was added.`);
      await queryClient.invalidateQueries({ queryKey: keys.landlords });
      // Property rows show the landlord's name.
      if (landlord) await queryClient.invalidateQueries({ queryKey: keys.properties });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: FIELDS,
        conflicts: { ID_NUMBER_TAKEN: 'idNumber' },
        describe: portfolioErrorMessage,
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<LandlordField, string>> = {};
    if (!values.name.trim()) found.name = 'Required.';
    if (!values.phone.trim()) found.phone = 'Required.';
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const clean = landlord ? nullable : optional;
    const body: Record<string, unknown> = {
      name: values.name.trim(),
      kind: values.kind,
      phone: values.phone.trim(),
      email: clean(values.email),
      kraPin: clean(values.kraPin),
    };
    if (landlord) body.status = values.status;
    const idNumber = optional(values.idNumber);
    if (idNumber) body.idNumber = idNumber;
    save.mutate(body);
  };

  const isCompany = values.kind === 'COMPANY';

  return (
    <Sheet
      title={landlord ? `Edit ${landlord.name}` : 'Add landlord'}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="landlord-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : landlord ? 'Save landlord' : 'Add landlord'}
          </button>
        </>
      )}
    >
      <form id="landlord-form" className="sheet-form" onSubmit={submit} noValidate>
        <div className="fld">
          <span className="fld__label">Owner is</span>
          <div className="pf__radios" role="radiogroup" aria-label="Owner is">
            <label className="fld__check">
              <input type="radio" name="ll-kind" checked={!isCompany} onChange={() => set('kind', 'INDIVIDUAL')} /> A person
            </label>
            <label className="fld__check">
              <input type="radio" name="ll-kind" checked={isCompany} onChange={() => set('kind', 'COMPANY')} /> A company
            </label>
          </div>
        </div>
        <div className="fm__grid sheet-grid">
          <Field id="ll-name" label={isCompany ? 'Company name' : 'Full name'} error={errors.name} wide>
            <input id="ll-name" value={values.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field id="ll-phone" label="Phone" error={errors.phone}>
            <input id="ll-phone" type="tel" inputMode="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)}
              placeholder="0712 345 678" autoComplete="off" aria-invalid={Boolean(errors.phone)} />
          </Field>
          <Field id="ll-email" label="Email" error={errors.email} optional>
            <input id="ll-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
          </Field>
          <Field id="ll-id" label={isCompany ? 'Registration number' : 'ID or passport number'} error={errors.idNumber} optional
            hint={landlord?.idNumberMasked ? `On file: ${landlord.idNumberMasked}. Leave empty to keep it.` : 'Stored encrypted.'}>
            <input id="ll-id" value={values.idNumber} onChange={(e) => set('idNumber', e.target.value)} autoComplete="off" aria-invalid={Boolean(errors.idNumber)} />
          </Field>
          <Field id="ll-kra" label="KRA PIN" error={errors.kraPin} optional>
            <input id="ll-kra" value={values.kraPin} onChange={(e) => set('kraPin', e.target.value.toUpperCase())} autoComplete="off" />
          </Field>
          {landlord ? (
            <Field id="ll-status" label="Status" error={errors.status}>
              <select id="ll-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
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
