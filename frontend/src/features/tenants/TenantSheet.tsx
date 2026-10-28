import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { keys, portfolioErrorMessage } from '../portfolio/api';
import { splitFormError } from '../portfolio/formErrors';
import { personName } from '../portfolio/labels';
import type { Tenant } from '../portfolio/types';
import { nullable, optional } from '../portfolio/forms';
import { useForm } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';

/**
 * Register or edit a tenant. Phone is required and unique in the organisation — it is the
 * identity for paybill payments and the tenant portal later.
 *
 * The ID number is stored encrypted and never sent back in full, so when editing the box
 * starts empty: leaving it empty keeps the number on file, typing replaces it.
 */

const FIELDS = [
  'firstName', 'lastName', 'phone', 'email', 'idNumber', 'kraPin',
  'emergencyContactName', 'emergencyContactPhone', 'notes',
] as const;
type TenantField = (typeof FIELDS)[number];

export function TenantSheet({ tenant, onClose }: { tenant?: Tenant; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<TenantField>({
    firstName: tenant?.firstName ?? '',
    lastName: tenant?.lastName ?? '',
    phone: tenant?.phone ?? '',
    email: tenant?.email ?? '',
    idNumber: '',
    kraPin: tenant?.kraPin ?? '',
    emergencyContactName: tenant?.emergencyContactName ?? '',
    emergencyContactPhone: tenant?.emergencyContactPhone ?? '',
    notes: tenant?.notes ?? '',
  });
  const { values, errors, set } = form;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (tenant
      ? api.patch<DataEnvelope<Tenant>>(`/tenants/${tenant.id}`, body)
      : api.post<DataEnvelope<Tenant>>('/tenants', body)),
    onSuccess: async (result) => {
      const name = result.data ? `${personName(result.data)} (${result.data.code})` : personName({ firstName: values.firstName, lastName: values.lastName });
      toast.saved(tenant ? `${name} was saved.` : `${name} was registered.`);
      await queryClient.invalidateQueries({ queryKey: keys.tenants });
      // Names and phones appear on unit and tenancy rows.
      if (tenant) {
        await queryClient.invalidateQueries({ queryKey: keys.units });
        await queryClient.invalidateQueries({ queryKey: keys.tenancies });
      }
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: FIELDS,
        // The conflict messages name the existing tenant's code when the server gives it.
        conflicts: { PHONE_TAKEN: 'phone', ID_NUMBER_TAKEN: 'idNumber' },
        describe: portfolioErrorMessage,
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<TenantField, string>> = {};
    if (!values.firstName.trim()) found.firstName = 'Required.';
    if (!values.lastName.trim()) found.lastName = 'Required.';
    if (!values.phone.trim()) found.phone = 'Required — it is how they will pay and sign in.';
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const clean = tenant ? nullable : optional;
    const body: Record<string, unknown> = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phone: values.phone.trim(),
      email: clean(values.email),
      kraPin: clean(values.kraPin),
      emergencyContactName: clean(values.emergencyContactName),
      emergencyContactPhone: clean(values.emergencyContactPhone),
      notes: clean(values.notes),
    };
    // Empty when editing means "keep the number on file", so it is not sent.
    const idNumber = optional(values.idNumber);
    if (idNumber) body.idNumber = idNumber;
    save.mutate(body);
  };

  const input = (name: TenantField, label: string, props: Record<string, string> = {}, opt = false, hint?: string) => (
    <Field id={`tn-${name}`} label={label} error={errors[name]} optional={opt} hint={hint}>
      <input id={`tn-${name}`} value={values[name]} onChange={(e) => set(name, e.target.value)}
        autoComplete="off" aria-invalid={Boolean(errors[name])} {...props} />
    </Field>
  );

  return (
    <Sheet
      title={tenant ? `Edit ${personName(tenant)}` : 'Add tenant'}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="tenant-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : tenant ? 'Save tenant' : 'Add tenant'}
          </button>
        </>
      )}
    >
      <form id="tenant-form" className="sheet-form" onSubmit={submit} noValidate>
        <div className="fm__grid sheet-grid">
          {input('firstName', 'First name')}
          {input('lastName', 'Last name')}
          {input('phone', 'Phone', { type: 'tel', inputMode: 'tel', placeholder: '0712 345 678' })}
          {input('email', 'Email', { type: 'email' }, true)}
          {input('idNumber', 'ID or passport number', {}, true,
            tenant?.idNumberMasked ? `On file: ${tenant.idNumberMasked}. Leave empty to keep it.` : 'Stored encrypted.')}
          {input('kraPin', 'KRA PIN', {}, true)}
          {input('emergencyContactName', 'Emergency contact', {}, true)}
          {input('emergencyContactPhone', 'Emergency contact phone', { type: 'tel', inputMode: 'tel' }, true)}
          <Field id="tn-notes" label="Notes" error={errors.notes} optional wide>
            <textarea id="tn-notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
