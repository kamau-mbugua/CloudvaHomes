import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { formatKES, minorToInput, parseAmount } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { TableSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { splitFormError } from '../portfolio/formErrors';
import { optional } from '../portfolio/forms';
import { TENANCY_STATUS } from '../portfolio/labels';
import type { TenancyStatus } from '../portfolio/types';
import { Badge, Field } from '../portfolio/ui';
import { AFTER_PAYMENT_KEYS, paymentsErrorMessage, useDeposit } from './api';
import { DEPOSIT_KIND } from './labels';
import { checkSettlement } from './rules';
import type { SettlementDraft } from './rules';
import { SignedAmount } from './ui';

/**
 * A tenancy's deposit (`GET /tenancies/:id/deposit`): the amount held and its ledger —
 * opening balance, received on the move-in invoice, applied to invoices, refunded.
 * "Settle deposit" appears once the tenancy is on notice or ended and money is held:
 * applying needs `payments:create`, refunding `payments:refund`.
 */

export interface DepositTenancy {
  id: string;
  status: TenancyStatus;
  /** "A4, Kilimani Court" — names the tenancy when a tenant has several. */
  label?: string;
}

export function DepositPanel({ tenancy, owed, who }: {
  tenancy: DepositTenancy;
  /** What the tenant owes now, to suggest how much to apply. */
  owed?: number | null;
  who: string;
}) {
  const canView = useCan('payments:view');
  const canApply = useCan('payments:create');
  const canRefund = useCan('payments:refund');
  const deposit = useDeposit(tenancy.id, canView);
  const [settling, setSettling] = useState(false);
  if (!canView) return null;

  const d = deposit.data;
  const settleable = tenancy.status === 'NOTICE' || tenancy.status === 'ENDED';

  return (
    <div className="py__deposit">
      <div className="py__deposithead">
        <div>
          {tenancy.label ? <strong>{tenancy.label}</strong> : null} <Badge table={TENANCY_STATUS} value={tenancy.status} />
          <span className="ad__sub">Held <strong className="num">{d ? formatKES(d.held) : '…'}</strong></span>
        </div>
        {d && settleable && d.held > 0 && (canApply || canRefund) ? (
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => setSettling(true)}>Settle deposit</button>
        ) : null}
      </div>
      {deposit.isError ? <p className="ad__error" role="alert">{paymentsErrorMessage(deposit.error)}</p>
        : deposit.isPending ? <TableSkeleton rows={2} />
          : !d || d.transactions.length === 0 ? <p className="ad__muted">No deposit recorded.</p>
            : (
              <div className="ad__tablewrap">
                <table className="ad__table py__ledger">
                  <thead><tr><th>When</th><th>Entry</th><th>Reference</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {d.transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{formatDateTime(t.createdAt)}{t.createdBy ? <span className="ad__sub">{t.createdBy.name}</span> : null}</td>
                        <td>{DEPOSIT_KIND[t.kind] ?? t.kind}{t.note ? <span className="ad__sub">{t.note}</span> : null}</td>
                        <td className="num">
                          {t.paymentId ? <Link to={`/app/payments/${t.paymentId}`}>{t.reference ?? 'Payment'}</Link>
                            : t.invoiceId ? <Link to={`/app/invoices/${t.invoiceId}`}>{t.reference ?? 'Invoice'}</Link>
                              : t.reference ?? <span className="nx-muted">—</span>}
                        </td>
                        <td className="num"><SignedAmount minor={t.amount} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th colSpan={3}>Held</th><th className="num">{formatKES(d.held)}</th></tr></tfoot>
                </table>
              </div>
            )}
      {settling && d ? (
        <SettleDepositDialog tenancyId={tenancy.id} held={d.held} owed={owed ?? null} who={who}
          canApply={canApply} canRefund={canRefund} onClose={() => setSettling(false)} />
      ) : null}
    </div>
  );
}

function SettleDepositDialog({ tenancyId, held, owed, who, canApply, canRefund, onClose }: {
  tenancyId: string;
  held: number;
  owed: number | null;
  who: string;
  canApply: boolean;
  canRefund: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const suggestApply = canApply && owed !== null && owed > 0 ? Math.min(owed, held) : 0;
  const [values, setValues] = useState<SettlementDraft & { note: string }>({
    applyAmount: suggestApply > 0 ? minorToInput(suggestApply) : '',
    refundAmount: '',
    refundReference: '',
    note: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof SettlementDraft | 'note', string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = (name: keyof typeof values, value: string) => setValues((v) => ({ ...v, [name]: value }));

  const read = (text: string) => {
    const parsed = text.trim() ? parseAmount(text) : null;
    return parsed?.ok ? parsed.minor : 0;
  };
  const left = held - read(values.applyAmount) - read(values.refundAmount);

  const settle = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/tenancies/${tenancyId}/deposit/settle`, body),
    onSuccess: async () => {
      toast.saved(`${who}’s deposit was settled.`);
      await Promise.all(AFTER_PAYMENT_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general: message } = splitFormError(error, {
        fields: ['applyAmount', 'refundAmount', 'refundReference', 'note'], describe: (e) => paymentsErrorMessage(e),
      });
      setErrors(fieldErrors);
      setGeneral(message);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkSettlement(
      { applyAmount: canApply ? values.applyAmount : '', refundAmount: canRefund ? values.refundAmount : '', refundReference: values.refundReference },
      held,
    );
    if (!checked.ok) {
      setErrors(checked.errors);
      setGeneral(checked.general ?? null);
      return;
    }
    setErrors({});
    setGeneral(null);
    const body: Record<string, unknown> = { note: optional(values.note) };
    if (checked.applyAmount > 0) body.applyAmount = checked.applyAmount;
    if (checked.refundAmount > 0) {
      body.refundAmount = checked.refundAmount;
      body.refundReference = checked.refundReference;
    }
    settle.mutate(body);
  };

  return (
    <Sheet
      title={`Settle deposit — ${who}`}
      busy={settle.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={settle.isPending}>Cancel</button>
          <button type="submit" form="settle-form" className="nx-btn nx-btn--primary" disabled={settle.isPending}>
            {settle.isPending ? 'Saving…' : 'Settle deposit'}
          </button>
        </>
      )}
    >
      <form id="settle-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <dl className="pf__facts py__settlefacts">
          <div><dt>Held</dt><dd className="num">{formatKES(held)}</dd></div>
          {owed !== null ? <div><dt>Tenant owes</dt><dd className={`num ${owed > 0 ? 'ad__owed' : ''}`}>{formatKES(Math.max(0, owed))}</dd></div> : null}
          <div><dt>Left held after this</dt><dd className={`num ${left < 0 ? 'ad__owed' : ''}`}>{formatKES(left)}</dd></div>
        </dl>
        {canApply ? (
          <Field id="dp-apply" label="Apply to their invoices" optional error={errors.applyAmount}
            hint={`Pays open invoices, oldest due first. At most ${formatKES(held)}.`}>
            <input id="dp-apply" value={values.applyAmount} onChange={(e) => set('applyAmount', e.target.value)} inputMode="decimal"
              autoComplete="off" aria-invalid={Boolean(errors.applyAmount)} />
          </Field>
        ) : null}
        {canRefund ? (
          <>
            <Field id="dp-refund" label="Refund to the tenant" optional error={errors.refundAmount}
              hint={`Money paid back. Applied and refunded together at most ${formatKES(held)}.`}>
              <input id="dp-refund" value={values.refundAmount} onChange={(e) => set('refundAmount', e.target.value)} inputMode="decimal"
                autoComplete="off" aria-invalid={Boolean(errors.refundAmount)} />
            </Field>
            <Field id="dp-ref" label="Refund reference" error={errors.refundReference} optional={!read(values.refundAmount)}
              hint="The M-Pesa code, cheque number or bank transfer reference.">
              <input id="dp-ref" value={values.refundReference} onChange={(e) => set('refundReference', e.target.value)} maxLength={60}
                autoComplete="off" aria-invalid={Boolean(errors.refundReference)} />
            </Field>
          </>
        ) : null}
        {!canApply || !canRefund ? (
          <p className="ad__muted">
            {canApply ? 'Your role can apply the deposit but not refund it.' : 'Your role can refund the deposit but not apply it to invoices.'}
          </p>
        ) : null}
        <Field id="dp-note" label="Note" optional error={errors.note}>
          <textarea id="dp-note" rows={2} maxLength={500} value={values.note} onChange={(e) => set('note', e.target.value)}
            placeholder="e.g. KES 3,000 kept for a broken window" />
        </Field>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
