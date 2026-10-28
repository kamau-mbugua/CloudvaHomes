import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { todayInNairobi } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { Field } from '../portfolio/ui';
import { downloadHodiInvoicePdf, keys, platformErrorMessage } from '../platform/api';
import { MANUAL_METHODS, PLATFORM_METHOD } from '../platform/labels';
import { checkPlatformPayment } from '../platform/rules';
import type { PaymentDraft } from '../platform/rules';
import type { PlatformInvoice } from '../platform/types';

/** Sheets the admin organisation page and the admin invoices list share. */

/**
 * "Record payment" (`POST /platform/payments`): money an organisation paid Hodi by bank
 * transfer, cheque or otherwise. Hodi pays its oldest invoices first and keeps any excess
 * as credit; a payment that clears what is overdue lifts a suspension.
 */
export function RecordHodiPaymentSheet({ org, onClose }: {
  org: { id: string; name: string; billingRef: string; balance?: number };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = todayInNairobi();
  const [draft, setDraft] = useState<PaymentDraft>({ amount: '', method: 'BANK', reference: '', receivedAt: today, note: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof PaymentDraft, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = (field: keyof PaymentDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const parsed = parseAmount(draft.amount);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<unknown>('/platform/payments', body),
    onSuccess: async (_response, body) => {
      toast.saved(`${formatKES(body.amount as number)} from ${org.name} recorded.`);
      await queryClient.invalidateQueries({ queryKey: keys.platform });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const found: Partial<Record<keyof PaymentDraft, string>> = {};
        for (const f of ['amount', 'method', 'reference', 'receivedAt', 'note'] as const) {
          if (error.fieldErrors[f]) found[f] = error.fieldErrors[f];
        }
        if (Object.keys(found).length > 0) { setErrors(found); return; }
      }
      if (error instanceof ApiError && error.code === 'DUPLICATE_REFERENCE') {
        setErrors({ reference: 'This reference is already recorded. The payment may already be in — check the payments below.' });
        return;
      }
      setGeneral(platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkPlatformPayment(org.id, draft, today);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate({ ...checked.body });
  };

  return (
    <Sheet
      title={`Record payment — ${org.name}`}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="hodi-record" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : parsed.ok && parsed.minor > 0 ? `Record ${formatKES(parsed.minor)}` : 'Record payment'}
          </button>
        </>
      )}
    >
      <form id="hodi-record" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">
          For money that reached Hodi outside M-Pesa matching, e.g. a bank transfer quoting <span className="num">{org.billingRef}</span>.
          It pays the oldest invoices first; anything extra is held as credit.
          {typeof org.balance === 'number' && org.balance > 0 ? ` ${org.name} owes ${formatKES(org.balance)}.` : ''}
        </p>
        <div className="fm__grid sheet-grid">
          <Field id="hr-amount" label="Amount (KES)" error={errors.amount}>
            <input id="hr-amount" inputMode="decimal" autoComplete="off" value={draft.amount} aria-invalid={Boolean(errors.amount)}
              onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <Field id="hr-method" label="Paid by" error={errors.method}>
            <select id="hr-method" value={draft.method} aria-invalid={Boolean(errors.method)} onChange={(e) => set('method', e.target.value)}>
              {MANUAL_METHODS.map((m) => <option key={m} value={m}>{PLATFORM_METHOD[m].label}</option>)}
            </select>
          </Field>
          <Field id="hr-ref" label="Reference" error={errors.reference} hint="The bank, cheque or M-Pesa reference. Each can be recorded once.">
            <input id="hr-ref" autoComplete="off" spellCheck={false} maxLength={64} value={draft.reference} aria-invalid={Boolean(errors.reference)}
              onChange={(e) => set('reference', e.target.value)} />
          </Field>
          <Field id="hr-date" label="Received on" error={errors.receivedAt}>
            <input id="hr-date" type="date" max={today} value={draft.receivedAt} aria-invalid={Boolean(errors.receivedAt)}
              onChange={(e) => set('receivedAt', e.target.value)} />
          </Field>
          <Field id="hr-note" label="Note" optional wide error={errors.note}>
            <input id="hr-note" autoComplete="off" maxLength={500} value={draft.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </div>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

/** "Void" (`POST /platform/invoices/:id/void`) with the reason, which is kept on the invoice. */
export function VoidHodiInvoiceSheet({ invoice, onClose }: { invoice: PlatformInvoice; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: { reason: string }) => api.post<unknown>(`/platform/invoices/${encodeURIComponent(invoice.id)}/void`, body),
    onSuccess: async () => {
      toast.saved(`${invoice.number} was voided.`);
      await queryClient.invalidateQueries({ queryKey: keys.platform });
      onClose();
    },
    onError: (e) => setGeneral(platformErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = reason.trim();
    setGeneral(null);
    if (text.length < 3) { setError('Say why, e.g. “Billed in error — units counted twice”.'); return; }
    setError(null);
    save.mutate({ reason: text });
  };

  return (
    <Sheet
      title={`Void ${invoice.number}?`}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Keep it</button>
          <button type="submit" form="hodi-void" className="nx-btn nx-btn--danger" disabled={save.isPending}>
            {save.isPending ? 'Voiding…' : 'Void invoice'}
          </button>
        </>
      )}
    >
      <form id="hodi-void" className="sheet-form" onSubmit={submit} noValidate>
        <p>
          {invoice.organization?.name ? `${invoice.organization.name}’s` : 'The'} invoice for {formatPeriod(invoice.period, true)},
          {' '}<span className="num">{formatKES(invoice.total)}</span>, stops counting as owed. Running the month again then bills it afresh.
        </p>
        <Field id="hv-reason" label="Reason" error={error ?? undefined} hint="Kept on the invoice and in the audit log.">
          <textarea id="hv-reason" rows={3} maxLength={500} value={reason} aria-invalid={Boolean(error)} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

/** A row's PDF and Void buttons in the admin invoice tables. Paid-on invoices can't be voided. */
export function AdminInvoiceActions({ invoice, onVoid }: { invoice: PlatformInvoice; onVoid: (invoice: PlatformInvoice) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pdf = async () => {
    setBusy(true);
    try {
      await downloadHodiInvoicePdf(invoice, 'platform');
    } catch (error) {
      toast.failed(platformErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="nx-btn nx-btn--sm" onClick={pdf} disabled={busy}>{busy ? 'Getting…' : 'PDF'}</button>
      {invoice.status !== 'VOID' ? (
        <button type="button" className="nx-btn nx-btn--sm nx-btn--danger" onClick={() => onVoid(invoice)}
          disabled={invoice.amountPaid > 0} title={invoice.amountPaid > 0 ? 'Something has been paid on it, so it can’t be voided' : undefined}>
          Void
        </button>
      ) : null}
    </>
  );
}
