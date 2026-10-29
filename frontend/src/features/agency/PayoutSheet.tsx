import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { Field } from '../portfolio/ui';
import { agencyErrorMessage, agencyKeys } from './api';
import { PAYOUT_METHOD } from './labels';
import { EMPTY_PAYOUT, checkPayout } from './rules';
import type { PayoutDraft, PayoutField } from './rules';
import type { PayoutMethod, PayoutSummary } from './types';

/**
 * Set or replace a landlord's payout details (`PUT /landlords/:id/payout`).
 *
 * Write-only: the API never returns the details in full, so the form always starts empty
 * and shows only the masked version on file. Saving asks for a verification code
 * (step-up, handled by the app-wide StepUpProvider) and Hodi tells the landlord — quietly
 * changed payout details are a known fraud route.
 */
export function PayoutSheet({ landlord, current, onClose }: {
  landlord: { id: string; name: string };
  current: PayoutSummary | null | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<PayoutDraft>({ method: current?.method ?? 'BANK', ...EMPTY_PAYOUT });
  const [errors, setErrors] = useState<Partial<Record<PayoutField, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = (field: keyof PayoutDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const save = useMutation({
    mutationFn: (body: Record<string, string>) => api.put<unknown>(`/landlords/${landlord.id}/payout`, body),
    onSuccess: async () => {
      toast.saved(`${landlord.name}’s payout details were saved. They have been told about the change.`);
      await queryClient.invalidateQueries({ queryKey: agencyKeys.accounts });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && error.details.length > 0) {
        const found: Partial<Record<PayoutField, string>> = {};
        for (const d of error.details) if (d.field in EMPTY_PAYOUT) found[d.field as PayoutField] = d.message;
        setErrors(found);
        setGeneral(Object.keys(found).length === error.details.length ? null : error.message);
        return;
      }
      setGeneral(agencyErrorMessage(error, {
        STEP_UP_REQUIRED: 'Payout details can only be changed after entering a verification code. Save again and enter the code when asked.',
      }));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkPayout(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate(checked.body);
  };

  const input = (field: PayoutField, label: string, props: { hint?: string; optional?: boolean; inputMode?: 'numeric' | 'tel'; placeholder?: string } = {}) => (
    <Field id={`po-${field}`} label={label} error={errors[field]} hint={props.hint} optional={props.optional}>
      <input id={`po-${field}`} value={draft[field]} onChange={(e) => set(field, e.target.value)} autoComplete="off" spellCheck={false}
        inputMode={props.inputMode} placeholder={props.placeholder} aria-invalid={Boolean(errors[field])} />
    </Field>
  );

  return (
    <Sheet
      title={current ? `Change payout details · ${landlord.name}` : `Add payout details · ${landlord.name}`}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="payout-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save payout details'}
          </button>
        </>
      )}
    >
      <form id="payout-form" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__callout ad__callout--note ag__warnnote">
          {current ? <>On file now: <strong className="num">{current.masked}</strong> ({PAYOUT_METHOD[current.method] ?? current.method}). </> : null}
          You’ll be asked for a verification code, and KodiHub will tell {landlord.name} about this change by SMS and e-mail — so
          if someone changes these details without their knowledge, they can raise the alarm before a payout goes out.
        </p>

        <div className="fld">
          <span className="fld__label">Pay by</span>
          <div className="pf__radios" role="radiogroup" aria-label="Pay by">
            {(Object.keys(PAYOUT_METHOD) as PayoutMethod[]).map((m) => (
              <label key={m} className="fld__check">
                <input type="radio" name="po-method" checked={draft.method === m} onChange={() => { setDraft({ method: m, ...EMPTY_PAYOUT }); setErrors({}); }} />
                {PAYOUT_METHOD[m]}
              </label>
            ))}
          </div>
        </div>

        <div className="fm__grid sheet-grid">
          {draft.method === 'BANK' ? (
            <>
              {input('bankName', 'Bank', { placeholder: 'e.g. KCB' })}
              {input('branch', 'Branch', { optional: true })}
              {input('accountName', 'Account name')}
              {input('accountNumber', 'Account number', { inputMode: 'numeric' })}
            </>
          ) : draft.method === 'MPESA' ? (
            input('phone', 'M-Pesa phone number', { inputMode: 'tel', placeholder: '0712 345 678' })
          ) : (
            input('payeeName', 'Cheques payable to')
          )}
        </div>
        <p className="hint">Stored encrypted. After saving, only the last digits are ever shown.</p>

        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
