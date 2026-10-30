import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES, minorToInput, parseAmount } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { keys as portfolioKeys } from '../portfolio/api';
import { optional } from '../portfolio/forms';
import { useDebounced } from '../portfolio/hooks';
import { personName } from '../portfolio/labels';
import type { Tenant, TenantRef } from '../portfolio/types';
import { Field } from '../portfolio/ui';
import { AllocationEditor } from './AllocationEditor';
import { useAllocationDraft } from './useAllocationDraft';
import { AFTER_PAYMENT_KEYS, downloadReceiptPdf, paymentsErrorMessage, useChannels, useOpenInvoices } from './api';
import { CHANNEL_KIND, referenceHint, referenceLabel } from './labels';
import {
  activeChannels, channelDetails, checkPaymentAmount, checkReceivedAt, checkReference, normaliseReference, splitPaymentError, unwrap,
} from './rules';
import type { OpenInvoice, RecordedPayment } from './types';

/**
 * Record money received by cash, cheque, bank slip or a manually entered M-Pesa code
 * (`POST /payments`).
 *
 * Pick the tenant (or open it from their page or an invoice), type the amount and the
 * open invoices fill in oldest due first — or the invoice it was opened from first. With
 * "Allocate automatically" on, the request carries no allocations and the server applies
 * the same rule; switched off, each invoice's share can be changed. Whatever is not
 * allocated stays with the tenant as credit. Afterwards the sheet shows the receipt.
 */

const FIELDS = ['tenantId', 'amount', 'channelId', 'receivedAt', 'reference', 'paidBy', 'note', 'allocations'] as const;
type FieldName = (typeof FIELDS)[number];

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function RecordPaymentSheet({
  tenant,
  invoice,
  onClose,
}: {
  /** Fixes the tenant (opened from a tenant or invoice page). */
  tenant?: TenantRef;
  /** Opened from this invoice: its balance is the suggested amount and it is paid first. */
  invoice?: { id: string; number: string; balance: number };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSearch = useCan('tenants:view');
  const canSeeChannels = useCan('channels:view');
  const today = todayInNairobi();

  const [picked, setPicked] = useState<TenantRef | null>(tenant ?? null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [amount, setAmount] = useState(invoice ? minorToInput(invoice.balance) : '');
  const [channelId, setChannelId] = useState('');
  const [receivedAt, setReceivedAt] = useState(today);
  const [reference, setReference] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [result, setResult] = useState<RecordedPayment | null>(null);
  // One key per attempt at this payment, so a retried request after a dropped answer is
  // not recorded twice. A new key once something changes or after it is saved.
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [downloading, setDownloading] = useState(false);

  const tenants = useQuery({
    queryKey: [...portfolioKeys.tenants, 'search', term],
    queryFn: () => api.get<PageEnvelope<Tenant>>('/tenants', { q: term, pageSize: 8 }),
    enabled: !tenant && canSearch && !picked,
  });
  const open = useOpenInvoices(picked?.id);
  const channels = useChannels({ status: 'ACTIVE' }, canSeeChannels);

  const invoices: OpenInvoice[] = open.data ?? [];
  const channelRows = activeChannels(channels.data ?? []);
  const channel = channelRows.find((c) => c.id === channelId);
  const parsedAmount = parseAmount(amount);
  const amountMinor = parsedAmount.ok ? parsedAmount.minor : 0;
  const owedTotal = invoices.reduce((s, i) => s + i.balance, 0);

  const touch = () => setIdempotencyKey(newKey());
  const allocation = useAllocationDraft(invoices, amountMinor, { preferId: invoice?.id, initialAuto: !invoice, onChange: touch });

  const record = useMutation({
    mutationFn: ({ body }: { body: Record<string, unknown>; sent: string[] }) =>
      api.post<unknown>('/payments', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
    onSuccess: async (response) => {
      const payment = unwrap<RecordedPayment>(response);
      setResult(payment);
      toast.saved(`Payment ${payment.number} of ${formatKES(payment.amount)} was recorded.`);
      await Promise.all(AFTER_PAYMENT_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    onError: (error, { sent }) => {
      const split = splitPaymentError(error, sent, FIELDS, { DUPLICATE_REFERENCE: 'reference', CHANNEL_INACTIVE: 'channelId' },
        (e) => paymentsErrorMessage(e));
      allocation.setRowErrors(split.byInvoice);
      setErrors(split.byField);
      setGeneral(split.general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<FieldName, string>> = {};
    if (!picked) found.tenantId = 'Find and choose the tenant who paid.';
    const checkedAmount = checkPaymentAmount(amount);
    if (!checkedAmount.ok) found.amount = checkedAmount.error;
    if (!channel) found.channelId = 'Choose how the money came in.';
    const dateError = checkReceivedAt(receivedAt, today);
    if (dateError) found.receivedAt = dateError;
    const refError = checkReference(channel?.kind, reference);
    if (refError) found.reference = refError;

    let allocations: { invoiceId: string; amount: number }[] | undefined;
    let allocationsOk = true;
    if (checkedAmount.ok) {
      const checked = allocation.check(checkedAmount.minor);
      if (checked.ok) allocations = checked.allocations;
      else {
        allocationsOk = false;
        if (checked.general) found.allocations = checked.general;
      }
    }
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0 || !allocationsOk || !picked || !checkedAmount.ok || !channel) return;

    const body: Record<string, unknown> = {
      tenantId: picked.id,
      channelId: channel.id,
      amount: checkedAmount.minor,
      receivedAt,
      reference: optional(normaliseReference(channel.kind, reference)),
      paidBy: optional(paidBy),
      note: optional(note),
      notifyTenant: notify,
    };
    if (!allocation.auto) body.allocations = allocations ?? [];
    record.mutate({ body, sent: (allocations ?? []).map((a) => a.invoiceId) });
  };

  const again = () => {
    setResult(null);
    setAmount('');
    allocation.reset(true);
    setReference('');
    setPaidBy('');
    setNote('');
    setErrors({});
    setGeneral(null);
    if (!tenant) setPicked(null);
    touch();
  };

  const download = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      await downloadReceiptPdf(result);
    } catch (error) {
      toast.failed(paymentsErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  if (result) {
    return (
      <Sheet
        title={`Payment recorded — ${result.number}`}
        wide
        onClose={onClose}
        footer={(
          <>
            <button type="button" className="nx-btn" onClick={again}>Record another</button>
            <button type="button" className="nx-btn" onClick={download} disabled={downloading}>{downloading ? 'Preparing…' : 'Download receipt'}</button>
            <button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>Done</button>
          </>
        )}
      >
        <div className="py__done" role="status">
          <p className="py__donehead">
            <span className="num">{formatKES(result.amount)}</span> from {personName(result.tenant)}, received {formatDay(result.receivedAt)}.
          </p>
          <dl className="pf__facts">
            <div><dt>Receipt</dt><dd><Link to={`/app/payments/${result.id}`} onClick={onClose}><strong className="num">{result.number}</strong></Link></dd></div>
            <div><dt>Credit left</dt><dd className="num">{formatKES(result.unallocated)}</dd></div>
            <div>
              <dt>Receipt sent (SMS &amp; email)</dt>
              <dd>
                {result.receiptSent ? <span className="ad__badge ad__badge--ok">Sent</span>
                  : notify ? <span className="ad__badge ad__badge--warn">Not sent</span>
                    : <span className="ad__badge ad__badge--off">Not requested</span>}
              </dd>
            </div>
          </dl>
          {!result.receiptSent && notify ? (
            <p className="ad__muted">The receipt notification could not be sent. The payment is saved; give the tenant the PDF receipt instead.</p>
          ) : null}
          <h3 className="ad__h2">Allocated to</h3>
          {(result.allocations ?? []).length === 0 ? (
            <p className="ad__muted">No invoices — the whole amount is the tenant’s credit and will be used on their next invoice.</p>
          ) : (
            <ul className="py__alloclist">
              {result.allocations.map((a) => (
                <li key={a.invoice.id}>
                  <span><Link to={`/app/invoices/${a.invoice.id}`} onClick={onClose} className="num">{a.invoice.number}</Link>
                    <span className="ad__muted"> · {formatPeriod(a.invoice.period)}</span></span>
                  <span className="num">{formatKES(a.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    );
  }

  const tenantRows = tenants.data?.data ?? [];

  return (
    <Sheet
      title={invoice ? `Record payment — ${invoice.number}` : 'Record a payment'}
      wide
      busy={record.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={record.isPending}>Cancel</button>
          <button type="submit" form="payment-form" className="nx-btn nx-btn--primary" disabled={record.isPending}>
            {record.isPending ? 'Recording…' : amountMinor > 0 ? `Record ${formatKES(amountMinor)}` : 'Record payment'}
          </button>
        </>
      )}
    >
      <form id="payment-form" className="sheet-form" onSubmit={submit} noValidate>
        {/* ---- who paid */}
        <div className={`fld ${errors.tenantId ? 'is-bad' : ''}`}>
          <span className="fld__label">Tenant</span>
          {picked ? (
            <div className="py__picked">
              <span><strong>{personName(picked)}</strong> <span className="ad__muted num">{picked.code} · {picked.phone}</span></span>
              {!tenant ? (
                <button type="button" className="nx-btn nx-btn--sm" onClick={() => { setPicked(null); allocation.reset(allocation.auto); touch(); }}>Change</button>
              ) : null}
            </div>
          ) : !canSearch ? (
            <p className="ad__muted">Your role cannot look up tenants. Record the payment from the tenant’s page or an invoice instead.</p>
          ) : (
            <>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
                placeholder="Search by name, phone or tenant code" aria-label="Search tenants" />
              <div className="pf__results" role="listbox" aria-label="Tenants">
                {tenantRows.map((t) => (
                  <button key={t.id} type="button" role="option" aria-selected={false} className="pf__result"
                    onClick={() => { setPicked(t); allocation.reset(allocation.auto); touch(); }}>
                    <strong>{personName(t)}</strong>
                    <span className="num">{t.code} · {t.phone}</span>
                  </button>
                ))}
                {tenants.isSuccess && tenantRows.length === 0 ? <span className="hint">No tenants match.</span> : null}
                {tenants.isError ? <span className="fld__err">{paymentsErrorMessage(tenants.error)}</span> : null}
              </div>
            </>
          )}
          {errors.tenantId ? <span className="fld__err">{errors.tenantId}</span> : null}
        </div>

        {/* ---- how much, how, when */}
        <div className="fm__grid sheet-grid">
          <Field id="pm-amount" label="Amount received" error={errors.amount} hint={owedTotal > 0 ? `Open invoices come to ${formatKES(owedTotal)}.` : 'In KES, e.g. 25,000.'}>
            <input id="pm-amount" value={amount} inputMode="decimal" autoComplete="off" aria-invalid={Boolean(errors.amount)}
              onChange={(e) => { setAmount(e.target.value); touch(); }} />
          </Field>
          <Field id="pm-date" label="Received on" error={errors.receivedAt} hint="The day the money came in, not today’s entry date.">
            <input id="pm-date" type="date" max={today} value={receivedAt} aria-invalid={Boolean(errors.receivedAt)}
              onChange={(e) => { setReceivedAt(e.target.value); touch(); }} />
          </Field>
          <Field id="pm-channel" label="Channel" error={errors.channelId}
            hint={!canSeeChannels ? 'Your role cannot list payment channels.' : channel ? channelDetails(channel) || CHANNEL_KIND[channel.kind]?.label : undefined}>
            <select id="pm-channel" value={channelId} aria-invalid={Boolean(errors.channelId)} disabled={!canSeeChannels}
              onChange={(e) => { setChannelId(e.target.value); touch(); }}>
              <option value="">{channels.isPending && canSeeChannels ? 'Loading…' : 'Choose…'}</option>
              {channelRows.map((c) => <option key={c.id} value={c.id}>{c.name} ({CHANNEL_KIND[c.kind]?.label ?? c.kind})</option>)}
            </select>
          </Field>
          <Field id="pm-ref" label={referenceLabel(channel?.kind)} error={errors.reference} hint={referenceHint(channel?.kind)}
            optional={channel ? channel.kind === 'CASH' || channel.kind === 'BANK_ACCOUNT' : true}>
            <input id="pm-ref" value={reference} autoComplete="off" maxLength={60} aria-invalid={Boolean(errors.reference)}
              className={channel?.kind === 'MPESA_PAYBILL' || channel?.kind === 'MPESA_TILL' ? 'py__code' : undefined}
              onChange={(e) => { setReference(e.target.value); touch(); }} />
          </Field>
          <Field id="pm-paidby" label="Paid by" optional error={errors.paidBy} hint="If someone else paid, e.g. a parent or employer.">
            <input id="pm-paidby" value={paidBy} autoComplete="off" maxLength={120} onChange={(e) => { setPaidBy(e.target.value); touch(); }} />
          </Field>
          <Field id="pm-note" label="Note" optional error={errors.note}>
            <input id="pm-note" value={note} autoComplete="off" maxLength={500} onChange={(e) => { setNote(e.target.value); touch(); }} />
          </Field>
        </div>
        {channels.isError ? <p className="fld__err">{paymentsErrorMessage(channels.error)}</p> : null}
        {canSeeChannels && channels.isSuccess && channelRows.length === 0 ? (
          <p className="ad__muted">There are no active payment channels. Add one under Money → Payment channels first.</p>
        ) : null}

        {/* ---- allocation */}
        {picked ? (
          <AllocationEditor draft={allocation} amountMinor={amountMinor} invoicesState={{ pending: open.isPending, error: open.error }}
            tenantName={personName(picked)} preferId={invoice?.id} error={errors.allocations} />
        ) : null}

        <label className="fld__check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Send SMS &amp; email receipt (with PDF attached) to the tenant
        </label>

        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
