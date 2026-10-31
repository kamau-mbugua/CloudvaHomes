import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime, formatDay } from '../../lib/dates';
import { formatKES, minorToInput } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { trimQuantity } from '../../lib/quantity';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { splitFormError } from '../portfolio/formErrors';
import { useForm } from '../portfolio/hooks';
import { personName } from '../portfolio/labels';
import { Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { AFTER_INVOICE_KEYS, billingErrorMessage, downloadInvoicePdf, keys } from './api';
import { INVOICE_KIND, LINE_KIND } from './labels';
import { canCreditInvoice, canVoidInvoice, checkCreditAmount } from './rules';
import type { InvoiceDetail } from './types';
import { InvoiceBadges } from './ui';
import { PAYMENT_METHOD } from '../payments/labels';
import { RecordPaymentSheet } from '../payments/RecordPaymentSheet';
import { StkRequestDialog } from '../mpesa/StkRequestDialog';
import { SignedAmount } from '../payments/ui';
import { labelFor } from '../portfolio/labels';

/**
 * One invoice: who and what it bills, its lines, credit notes and balance. Invoices are
 * never edited — a credit note reduces the balance, a void cancels an invoice with nothing
 * paid or credited (and unlocks its readings and variable amounts). Both need
 * `invoices:void`. The PDF is fetched with the session token and saved. Payments
 * allocated to it are listed, and "Record payment" opens the payment sheet with this
 * invoice paid first (`payments:create`); "Request M-Pesa payment" sends an STK prompt
 * for its balance, paying it first.
 */
export function InvoiceDetailPage() {
  const { invoiceId = '' } = useParams();
  const toast = useToast();
  const canAdjust = useCan('invoices:void');
  const canSeeTenants = useCan('tenants:view');
  const canSeeUnits = useCan('units:view');
  const canRecord = useCan('payments:create');
  const canSeePayments = useCan('payments:view');
  const canSeeChannels = useCan('channels:view');
  const [dialog, setDialog] = useState<'credit' | 'void' | 'pay' | 'stk' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [tab, setTab] = useState<'lines' | 'details' | 'credits' | 'payments'>('lines');

  const invoice = useQuery({
    queryKey: [...keys.invoices, 'detail', invoiceId],
    queryFn: () => api.get<DataEnvelope<InvoiceDetail>>(`/invoices/${invoiceId}`).then((r) => r.data),
  });

  if (invoice.isPending) return <CardSkeleton count={3} />;
  if (invoice.isError) {
    return (
      <div className="ph">
        <EmptyState title="Invoice not available" detail={billingErrorMessage(invoice.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/invoices">Back to invoices</Link>} />
      </div>
    );
  }

  const inv = invoice.data;
  const download = async () => {
    setDownloading(true);
    try {
      await downloadInvoicePdf(inv);
    } catch (error) {
      toast.failed(billingErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[{ label: 'Invoices', to: '/app/invoices' }, { label: inv.number }]} />

      <div className="pf__head">
        <div>
          <h1><span className="num">{inv.number}</span> <InvoiceBadges invoice={inv} /></h1>
          <p>
            {INVOICE_KIND[inv.kind]?.label ?? inv.kind} invoice for {formatPeriod(inv.period, true)} ·{' '}
            {canSeeTenants ? <Link to={`/app/tenants/${inv.tenant.id}`}>{personName(inv.tenant)}</Link> : personName(inv.tenant)} ·{' '}
            {canSeeUnits ? <Link to={`/app/units/${inv.unit.id}`}>{inv.unit.number}</Link> : inv.unit.number}, {inv.property.name}
          </p>
        </div>
        <div className="sl__headactions">
          {canRecord && inv.status !== 'VOID' && inv.balance > 0 ? (
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setDialog('pay')}>Record payment</button>
          ) : null}
          {canRecord && canSeeChannels && inv.status !== 'VOID' && inv.balance > 0 ? (
            <button type="button" className="nx-btn" onClick={() => setDialog('stk')}>Request M-Pesa payment</button>
          ) : null}
          <button type="button" className="nx-btn" onClick={download} disabled={downloading}>{downloading ? 'Preparing…' : 'Download PDF'}</button>
          {canAdjust && canCreditInvoice(inv) ? (
            <button type="button" className="nx-btn" onClick={() => setDialog('credit')}>Credit note</button>
          ) : null}
          {canAdjust && canVoidInvoice(inv) ? (
            <button type="button" className="nx-btn nx-btn--danger" onClick={() => setDialog('void')}>Void</button>
          ) : null}
        </div>
      </div>

      {inv.status === 'VOID' ? (
        <div className="ad__callout ad__callout--note" role="note">
          Voided {formatDateTime(inv.voidedAt)}{inv.voidReason ? ` — ${inv.voidReason}` : ''}. It no longer counts towards the tenant’s balance.
        </div>
      ) : null}

      <div className="ad__stats pf__stats bl__stats">
        <div className="ad__stat"><span className="ad__stat__label">Total</span><span className="ad__stat__value num">{formatKES(inv.total)}</span></div>
        <div className="ad__stat"><span className="ad__stat__label">Paid</span><span className="ad__stat__value num">{formatKES(inv.amountPaid)}</span></div>
        <div className="ad__stat"><span className="ad__stat__label">Credited</span><span className="ad__stat__value num">{formatKES(inv.creditedAmount)}</span></div>
        <div className="ad__stat">
          <span className="ad__stat__label">Balance{inv.overdue && inv.status !== 'VOID' ? ' · overdue' : ''}</span>
          <span className={`ad__stat__value num ${inv.overdue && inv.status !== 'VOID' ? 'ad__owed' : ''}`}>{formatKES(inv.balance)}</span>
        </div>
      </div>

      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Invoice sections">
          <button type="button" role="tab" aria-selected={tab === 'lines'} className="pf__tab" onClick={() => setTab('lines')}>
            Lines ({inv.lines.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'details'} className="pf__tab" onClick={() => setTab('details')}>
            Details
          </button>
          <button type="button" role="tab" aria-selected={tab === 'credits'} className="pf__tab" onClick={() => setTab('credits')}>
            Credit notes ({inv.creditNotes.length})
          </button>
          {inv.payments ? (
            <button type="button" role="tab" aria-selected={tab === 'payments'} className="pf__tab" onClick={() => setTab('payments')}>
              Payments ({inv.payments.length})
            </button>
          ) : null}
        </div>
      </div>

      {tab === 'details' ? (
        <section className="fm__section">
          <h2>Details</h2>
          <dl className="pf__facts">
            <Fact label="Issued">{formatDay(inv.issueDate)}</Fact>
            <Fact label="Due">{formatDay(inv.dueDate)}</Fact>
            <Fact label="Period">{formatPeriod(inv.period, true)}</Fact>
            <Fact label="Tenant"><>{personName(inv.tenant)}<span className="ad__sub num">{inv.tenant.code} · {inv.tenant.phone}</span></></Fact>
            <Fact label="Unit">{inv.unit.number}, {inv.property.name}</Fact>
            <Fact label="Created">{formatDateTime(inv.createdAt)}</Fact>
          </dl>
        </section>
      ) : null}

      {tab === 'lines' ? (
        <section className="fm__section">
          <h2>Lines</h2>
          <div className="ad__tablewrap">
            <table className="ad__table bl__lines-table">
              <thead>
                <tr><th>Description</th><th className="num">Qty</th><th className="num">Unit amount</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {inv.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.description}
                      <span className="ad__sub">{LINE_KIND[line.kind] ?? line.kind}{line.refundable ? ' · refundable' : ''}</span>
                    </td>
                    <td className="num">{trimQuantity(line.quantity)}</td>
                    <td className="num">{formatKES(line.unitAmount)}</td>
                    <td className="num">{formatKES(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th colSpan={3}>Total</th><th className="num">{formatKES(inv.total)}</th></tr>
                {inv.creditedAmount > 0 ? <tr><th colSpan={3}>Credited</th><th className="num">-{formatKES(inv.creditedAmount)}</th></tr> : null}
                {inv.amountPaid > 0 ? <tr><th colSpan={3}>Paid</th><th className="num">-{formatKES(inv.amountPaid)}</th></tr> : null}
                <tr><th colSpan={3}>Balance</th><th className="num">{formatKES(inv.balance)}</th></tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'credits' ? (
        <section className="fm__section">
          <div className="pf__sectionhead"><h2>Credit notes</h2></div>
          {inv.creditNotes.length === 0 ? <p className="ad__muted">None.</p> : (
            <div className="ad__tablewrap">
              <table className="ad__table">
                <thead><tr><th>Number</th><th>Reason</th><th>By</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {inv.creditNotes.map((cn) => (
                    <tr key={cn.id}>
                      <td><strong className="num">{cn.number}</strong><span className="ad__sub">{formatDateTime(cn.createdAt)}</span></td>
                      <td>{cn.reason}</td>
                      <td>{cn.createdBy?.name ?? '—'}</td>
                      <td className="num">{formatKES(cn.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'payments' && inv.payments ? (
        <section className="fm__section">
          <div className="pf__sectionhead"><h2>Payments</h2></div>
          {inv.payments.length === 0 ? <p className="ad__muted">None yet.</p> : (
            <div className="ad__tablewrap">
              <table className="ad__table">
                <thead><tr><th>Receipt</th><th>Received</th><th>Method</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={`${p.id}-${p.amount}`} className={p.amount < 0 ? 'py__reversalrow' : undefined}>
                      <td>
                        {canSeePayments
                          ? <Link className="ad__link" to={`/app/payments/${p.id}`}><strong className="num">{p.number}</strong></Link>
                          : <strong className="num">{p.number}</strong>}
                        {p.amount < 0 ? <span className="ad__sub">Reversal</span> : null}
                      </td>
                      <td>{formatDay(p.receivedAt)}</td>
                      <td>{labelFor(PAYMENT_METHOD, p.method).label}</td>
                      <td className="num"><SignedAmount minor={p.amount} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {dialog === 'pay' ? <RecordPaymentSheet tenant={inv.tenant} invoice={inv} onClose={() => setDialog(null)} /> : null}
      {dialog === 'stk' ? <StkRequestDialog tenant={inv.tenant} invoice={inv} onClose={() => setDialog(null)} /> : null}
      {dialog === 'credit' ? <CreditNoteDialog invoice={inv} onClose={() => setDialog(null)} /> : null}
      {dialog === 'void' ? <VoidDialog invoice={inv} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function useRefreshInvoices() {
  const queryClient = useQueryClient();
  return () => Promise.all(AFTER_INVOICE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

function CreditNoteDialog({ invoice, onClose }: { invoice: InvoiceDetail; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshInvoices();
  const form = useForm<'amount' | 'reason'>({ amount: minorToInput(invoice.balance), reason: '' });

  const credit = useMutation({
    mutationFn: (body: { amount: number; reason: string }) => api.post(`/invoices/${invoice.id}/credit-notes`, body),
    onSuccess: async (_r, body) => {
      toast.saved(`A credit note for ${formatKES(body.amount)} was issued on ${invoice.number}.`);
      await refresh();
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, { fields: ['amount', 'reason'], describe: (e) => billingErrorMessage(e) });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = checkCreditAmount(form.values.amount, invoice.balance);
    const reason = form.values.reason.trim();
    const found: { amount?: string; reason?: string } = {};
    if (!amount.ok) found.amount = amount.error;
    if (!reason) found.reason = 'Say why, e.g. “Water over-read in October”.';
    form.setErrors(found);
    form.setGeneral(null);
    if (amount.ok && reason) credit.mutate({ amount: amount.minor, reason });
  };

  return (
    <Sheet
      title={`Credit note — ${invoice.number}`}
      busy={credit.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={credit.isPending}>Cancel</button>
          <button type="submit" form="credit-form" className="nx-btn nx-btn--primary" disabled={credit.isPending}>
            {credit.isPending ? 'Issuing…' : 'Issue credit note'}
          </button>
        </>
      )}
    >
      <form id="credit-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">Reduces what the tenant owes on this invoice. The invoice itself is not changed. Balance: <span className="num">{formatKES(invoice.balance)}</span>.</p>
        <Field id="cn-amount" label="Amount" error={form.errors.amount} hint="At most the balance.">
          <input id="cn-amount" value={form.values.amount} onChange={(e) => form.set('amount', e.target.value)} inputMode="decimal"
            autoComplete="off" aria-invalid={Boolean(form.errors.amount)} />
        </Field>
        <Field id="cn-reason" label="Reason" error={form.errors.reason}>
          <textarea id="cn-reason" rows={2} maxLength={500} value={form.values.reason} onChange={(e) => form.set('reason', e.target.value)}
            aria-invalid={Boolean(form.errors.reason)} />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

function VoidDialog({ invoice, onClose }: { invoice: InvoiceDetail; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshInvoices();
  const form = useForm<'reason'>({ reason: '' });

  const voidIt = useMutation({
    mutationFn: (reason: string) => api.post(`/invoices/${invoice.id}/void`, { reason }),
    onSuccess: async () => {
      toast.saved(`${invoice.number} was voided.`);
      await refresh();
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, { fields: ['reason'], describe: (e) => billingErrorMessage(e) });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const reason = form.values.reason.trim();
    form.setErrors(reason ? {} : { reason: 'Say why it is being voided.' });
    form.setGeneral(null);
    if (reason) voidIt.mutate(reason);
  };

  return (
    <Sheet
      title={`Void ${invoice.number}?`}
      busy={voidIt.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={voidIt.isPending}>Keep it</button>
          <button type="submit" form="void-form" className="nx-btn nx-btn--danger" disabled={voidIt.isPending}>
            {voidIt.isPending ? 'Voiding…' : 'Void invoice'}
          </button>
        </>
      )}
    >
      <form id="void-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">
          The invoice stays on record as void and no longer counts as owed. Meter readings and variable amounts on it are
          unlocked, so {formatPeriod(invoice.period)} can be billed again. This cannot be undone.
        </p>
        <Field id="vd-reason" label="Reason" error={form.errors.reason}>
          <textarea id="vd-reason" rows={2} maxLength={500} value={form.values.reason} onChange={(e) => form.set('reason', e.target.value)}
            aria-invalid={Boolean(form.errors.reason)} placeholder="e.g. Wrong water reading" />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
