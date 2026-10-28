import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { todayInNairobi } from '../../lib/dates';
import { minorToInput } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { PropertySelect } from '../billing/ui';
import { splitFormError } from '../portfolio/formErrors';
import { useForm } from '../portfolio/hooks';
import { optionsOf } from '../portfolio/labels';
import { Field } from '../portfolio/ui';
import type { AttachmentDraft } from '../uploads/api';
import { AttachmentField } from '../uploads/ui';
import { expensesErrorMessage, keys, reportKeys } from './api';
import { EXPENSE_CATEGORY } from './labels';
import { EXPENSE_FIELDS, checkExpense, receiptChange } from './rules';
import type { ExpenseField } from './rules';
import type { Expense } from './types';

/**
 * Add or edit an expense. The receipt is uploaded as soon as it is picked, so saving only
 * passes its id; Save waits while an upload is still going.
 */
export function ExpenseSheet({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSeeProperties = useCan('properties:view');
  const today = todayInNairobi();
  const form = useForm<Exclude<ExpenseField, 'receiptUploadId'>>({
    propertyId: expense?.property.id ?? '',
    category: expense?.category ?? '',
    name: expense?.name ?? '',
    amount: expense ? minorToInput(expense.amount) : '',
    incurredOn: expense?.incurredOn ?? today,
    payee: expense?.payee ?? '',
    reference: expense?.reference ?? '',
  });
  const { values, errors, set } = form;
  const [receipt, setReceipt] = useState<AttachmentDraft>({ kind: 'keep' });
  const [receiptError, setReceiptError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (expense
      ? api.patch(`/expenses/${expense.id}`, body)
      : api.post('/expenses', body)),
    onSuccess: async () => {
      toast.saved(expense ? 'The expense was saved.' : `${values.name.trim()} was recorded.`);
      await queryClient.invalidateQueries({ queryKey: keys.expenses });
      await queryClient.invalidateQueries({ queryKey: reportKeys });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: EXPENSE_FIELDS,
        conflicts: { UPLOAD_INVALID: 'receiptUploadId', UNSUPPORTED_FILE: 'receiptUploadId', FILE_TOO_LARGE: 'receiptUploadId' },
        describe: (e) => expensesErrorMessage(e),
      });
      const { receiptUploadId, ...rest } = fieldErrors;
      form.setErrors(rest);
      setReceiptError(receiptUploadId);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (uploading) return;
    const checked = checkExpense(values, today);
    form.setGeneral(null);
    setReceiptError(undefined);
    if (!checked.ok) {
      const { receiptUploadId, ...rest } = checked.errors;
      form.setErrors(rest);
      setReceiptError(receiptUploadId);
      return;
    }
    form.setErrors({});
    save.mutate({ ...checked.body, ...receiptChange(receipt) });
  };

  const busy = save.isPending;

  return (
    <Sheet
      title={expense ? `Edit ${expense.name}` : 'Record an expense'}
      wide
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="expense-form" className="nx-btn nx-btn--primary" disabled={busy || uploading}>
            {busy ? 'Saving…' : uploading ? 'Uploading…' : expense ? 'Save expense' : 'Record expense'}
          </button>
        </>
      )}
    >
      <form id="expense-form" className="fm__grid ex__form" onSubmit={submit} noValidate>
        <Field id="ex-property" label="Property" error={errors.propertyId}
          hint={!canSeeProperties ? 'Your role can’t list properties.' : undefined}>
          {canSeeProperties ? (
            <PropertySelect id="ex-property" className="" value={values.propertyId} onChange={(id) => set('propertyId', id)} />
          ) : (
            <input id="ex-property" value={expense ? `${expense.property.name} (${expense.property.code})` : ''} disabled />
          )}
        </Field>
        <Field id="ex-category" label="Category" error={errors.category}>
          <select id="ex-category" value={values.category} onChange={(e) => set('category', e.target.value)} aria-invalid={Boolean(errors.category)}>
            <option value="">Choose a category…</option>
            {optionsOf(EXPENSE_CATEGORY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field id="ex-name" label="What was it for" error={errors.name} wide>
          <input id="ex-name" value={values.name} maxLength={200} autoComplete="off" placeholder="e.g. Gate motor repair"
            onChange={(e) => set('name', e.target.value)} aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field id="ex-amount" label="Amount (KES)" error={errors.amount}>
          <input id="ex-amount" className="num" value={values.amount} inputMode="decimal" autoComplete="off" placeholder="0.00"
            onChange={(e) => set('amount', e.target.value)} aria-invalid={Boolean(errors.amount)} />
        </Field>
        <Field id="ex-date" label="Date" error={errors.incurredOn} hint="When it was paid or incurred.">
          <input id="ex-date" type="date" max={today} value={values.incurredOn}
            onChange={(e) => set('incurredOn', e.target.value)} aria-invalid={Boolean(errors.incurredOn)} />
        </Field>
        <Field id="ex-payee" label="Paid to" optional error={errors.payee}>
          <input id="ex-payee" value={values.payee} maxLength={200} autoComplete="off" placeholder="e.g. Sample Fundi Ltd"
            onChange={(e) => set('payee', e.target.value)} />
        </Field>
        <Field id="ex-ref" label="Reference" optional error={errors.reference} hint="An M-Pesa code, invoice or cheque number.">
          <input id="ex-ref" value={values.reference} maxLength={100} autoComplete="off"
            onChange={(e) => set('reference', e.target.value)} />
        </Field>
        <AttachmentField
          id="ex-receipt"
          label="Receipt"
          purpose="EXPENSE_RECEIPT"
          saved={expense?.receipt ? { path: `/expenses/${expense.id}/receipt`, contentType: expense.receipt.contentType, size: expense.receipt.size } : null}
          value={receipt}
          onChange={(next) => { setReceipt(next); setReceiptError(undefined); }}
          onBusy={setUploading}
          disabled={busy}
          error={receiptError}
          describeError={(e) => expensesErrorMessage(e)}
        />
        {form.general ? <p className="nx-sheet__error fm__wide" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
