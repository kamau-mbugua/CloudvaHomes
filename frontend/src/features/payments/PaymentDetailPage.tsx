import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime, formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { INVOICE_KIND } from '../billing/labels';
import { splitFormError } from '../portfolio/formErrors';
import { useForm } from '../portfolio/hooks';
import { personName } from '../portfolio/labels';
import { Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { AFTER_PAYMENT_KEYS, downloadReceiptPdf, keys, paymentsErrorMessage } from './api';
import { canReverse, isReversal, methodText, unwrap } from './rules';
import type { PaymentDetail } from './types';
import { PaymentBadges, SignedAmount } from './ui';

/**
 * One payment (`GET /payments/:id`): who paid, how, and which invoices it settled; the
 * receipt PDF; and "Reverse" (`payments:refund`), which records a mirror-image negative
 * payment — nothing is ever deleted. A reversal links back to what it reverses and a
 * reversed payment links to its reversal. A payment recorded from M-Pesa links to its
 * inbound transaction (`reconciliation:view`).
 */
export function PaymentDetailPage() {
  const { paymentId = '' } = useParams();
  const toast = useToast();
  const canRefund = useCan('payments:refund');
  const canSeeTenants = useCan('tenants:view');
  const canSeeInvoices = useCan('invoices:view');
  const canSeeInbound = useCan('reconciliation:view');
  const [reversing, setReversing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [tab, setTab] = useState<'allocations' | 'details'>('allocations');

  const payment = useQuery({
    queryKey: [...keys.payments, 'detail', paymentId],
    queryFn: () => api.get<unknown>(`/payments/${paymentId}`).then((body) => unwrap<PaymentDetail>(body)),
  });

  // A reversal names its original only by id; fetch it for the receipt number.
  const original = useQuery({
    queryKey: [...keys.payments, 'detail', payment.data?.reversesId],
    queryFn: () => api.get<unknown>(`/payments/${payment.data?.reversesId}`).then((body) => unwrap<PaymentDetail>(body)),
    enabled: Boolean(payment.data?.reversesId),
  });

  if (payment.isPending) return <CardSkeleton count={3} />;
  if (payment.isError) {
    return (
      <div className="ph">
        <EmptyState title="Payment not available" detail={paymentsErrorMessage(payment.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/payments">Back to payments</Link>} />
      </div>
    );
  }

  const p = payment.data;
  const reversal = isReversal(p);
  const download = async () => {
    setDownloading(true);
    try {
      await downloadReceiptPdf(p);
    } catch (error) {
      toast.failed(paymentsErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };
  const allocated = p.allocations.reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[{ label: 'Payments', to: '/app/payments' }, { label: p.number }]} />

      <div className="pf__head">
        <div>
          <h1><span className="num">{p.number}</span> <PaymentBadges payment={p} /></h1>
          <p>
            {reversal ? 'Reversal for ' : 'From '}
            {canSeeTenants ? <Link to={`/app/tenants/${p.tenant.id}`}>{personName(p.tenant)}</Link> : personName(p.tenant)}
            {' · '}<span className="num">{p.tenant.code}</span> · received {formatDay(p.receivedAt)}
          </p>
        </div>
        <div className="sl__headactions">
          <button type="button" className="nx-btn" onClick={download} disabled={downloading}>{downloading ? 'Preparing…' : 'Download receipt'}</button>
          {canRefund && canReverse(p) ? (
            <button type="button" className="nx-btn nx-btn--danger" onClick={() => setReversing(true)}>Reverse</button>
          ) : null}
        </div>
      </div>

      {reversal ? (
        <div className="ad__callout ad__callout--note py__reversalnote" role="note">
          This reverses{' '}
          {p.reversesId ? (
            <Link to={`/app/payments/${p.reversesId}`} className="num">{original.data?.number ?? 'the original payment'}</Link>
          ) : 'a payment'}
          {p.reversalReason ? ` — ${p.reversalReason}` : ''}. Every amount it had paid towards invoices was taken back, and those invoices are open again.
        </div>
      ) : p.reversedBy ? (
        <div className="ad__callout ad__callout--note py__reversalnote" role="note">
          Reversed by <Link to={`/app/payments/${p.reversedBy.id}`} className="num">{p.reversedBy.number}</Link>
          {p.reversalReason ? ` — ${p.reversalReason}` : ''}. It no longer counts towards the tenant’s balance.
        </div>
      ) : null}

      <div className="ad__stats pf__stats bl__stats">
        <div className="ad__stat"><span className="ad__stat__label">Amount</span><span className="ad__stat__value"><SignedAmount minor={p.amount} struck={Boolean(p.reversedBy)} /></span></div>
        <div className="ad__stat"><span className="ad__stat__label">{reversal ? 'Taken back from invoices' : 'Allocated to invoices'}</span><span className="ad__stat__value"><SignedAmount minor={allocated} /></span></div>
        {!reversal ? (
          <div className="ad__stat"><span className="ad__stat__label">Credit left</span><span className="ad__stat__value num">{formatKES(p.unallocated)}</span></div>
        ) : null}
      </div>

      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Payment sections">
          <button type="button" role="tab" aria-selected={tab === 'allocations'} className="pf__tab" onClick={() => setTab('allocations')}>
            {reversal ? 'Taken back from' : 'Allocated to'} ({p.allocations.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'details'} className="pf__tab" onClick={() => setTab('details')}>
            Details
          </button>
        </div>
      </div>

      {tab === 'details' ? (
        <section className="fm__section">
          <h2>Details</h2>
          <dl className="pf__facts">
            <Fact label="Method">{methodText(p)}</Fact>
            <Fact label="Reference"><span className="num">{p.reference}</span></Fact>
            <Fact label="Received on">{formatDay(p.receivedAt)}</Fact>
            <Fact label="Paid by">{p.paidBy}</Fact>
            <Fact label="Tenant"><>{personName(p.tenant)}<span className="ad__sub num">{p.tenant.code} · {p.tenant.phone}</span></></Fact>
            <Fact label="Recorded">{`${formatDateTime(p.createdAt)}${p.recordedBy ? ` by ${p.recordedBy.name}` : ''}`}</Fact>
            {p.inboundId ? (
              <Fact label="Source">
                {canSeeInbound
                  ? <Link to={`/app/reconciliation/${p.inboundId}`}>From M-Pesa — see the transaction</Link>
                  : 'From M-Pesa (recorded automatically)'}
              </Fact>
            ) : null}
            {p.note ? <Fact label="Note" wide>{p.note}</Fact> : null}
          </dl>
        </section>
      ) : (
        <section className="fm__section">
          <div className="pf__sectionhead"><h2>{reversal ? 'Taken back from' : 'Allocated to'}</h2></div>
          {p.allocations.length === 0 ? (
            <p className="ad__muted">{reversal ? 'Nothing — the original had not been allocated.' : 'No invoices. The whole amount is the tenant’s credit.'}</p>
          ) : (
            <div className="ad__tablewrap">
              <table className="ad__table">
                <thead><tr><th>Invoice</th><th>Period</th><th>Kind</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {p.allocations.map((a) => (
                    <tr key={a.invoice.id}>
                      <td>
                        {canSeeInvoices
                          ? <Link className="ad__link" to={`/app/invoices/${a.invoice.id}`}><strong className="num">{a.invoice.number}</strong></Link>
                          : <strong className="num">{a.invoice.number}</strong>}
                      </td>
                      <td>{formatPeriod(a.invoice.period)}</td>
                      <td>{INVOICE_KIND[a.invoice.kind]?.label ?? a.invoice.kind}</td>
                      <td className="num"><SignedAmount minor={a.amount} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {reversing ? <ReverseDialog payment={p} onClose={() => setReversing(false)} /> : null}
    </div>
  );
}

function ReverseDialog({ payment, onClose }: { payment: PaymentDetail; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm<'reason'>({ reason: '' });

  const reverse = useMutation({
    mutationFn: (reason: string) => api.post<unknown>(`/payments/${payment.id}/reverse`, { reason }),
    onSuccess: async (response) => {
      const created = unwrap<{ number?: string } | undefined>(response);
      toast.saved(`${payment.number} was reversed${created?.number ? ` by ${created.number}` : ''}.`);
      await Promise.all(AFTER_PAYMENT_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, { fields: ['reason'], describe: (e) => paymentsErrorMessage(e) });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const reason = form.values.reason.trim();
    form.setErrors(reason ? {} : { reason: 'Say why, e.g. “Entered against the wrong tenant”.' });
    form.setGeneral(null);
    if (reason) reverse.mutate(reason);
  };

  return (
    <Sheet
      title={`Reverse ${payment.number}?`}
      busy={reverse.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={reverse.isPending}>Keep it</button>
          <button type="submit" form="reverse-form" className="nx-btn nx-btn--danger" disabled={reverse.isPending}>
            {reverse.isPending ? 'Reversing…' : `Reverse ${formatKES(payment.amount)}`}
          </button>
        </>
      )}
    >
      <form id="reverse-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">
          Records a negative payment that takes back everything this one paid — including credit it later paid towards other
          invoices. Those invoices open again and the tenant owes the money again. The payment stays on record. A payment can
          only be reversed once, and this cannot be undone.
        </p>
        <Field id="rv-reason" label="Reason" error={form.errors.reason}>
          <textarea id="rv-reason" rows={2} maxLength={500} value={form.values.reason} onChange={(e) => form.set('reason', e.target.value)}
            aria-invalid={Boolean(form.errors.reason)} placeholder="e.g. Cheque bounced" />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
