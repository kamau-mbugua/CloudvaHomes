import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { Sheet } from '../../components/Sheet';
import { AFTER_PAYMENT_KEYS, useChannels } from '../payments/api';
import { CHANNEL_KIND } from '../payments/labels';
import { channelDetails, unwrap } from '../payments/rules';
import { personName } from '../portfolio/labels';
import { Badge, Field } from '../portfolio/ui';
import { keys, mpesaErrorMessage } from './api';
import { STK_STATE } from './labels';
import {
  checkStkAmount, checkStkPhone, describeStk, keyFor, newKey, signatureOf, stkChannels, suggestStkAmount,
} from './rules';
import { useStkFollow } from './useStkFollow';
import type { KeyedAttempt } from './rules';
import type { MpesaTenantRef, StkRequest } from './types';

/**
 * "Request M-Pesa payment" (`POST /stk-requests`): sends a payment prompt (STK push) to
 * the tenant's phone, then follows it (`GET /stk-requests/:id` every 3 s) until they pay,
 * cancel or let it lapse. The payment is recorded by the server, not here — closing the
 * dialog stops only the watching.
 *
 * The `Idempotency-Key` stays the same while the input does, so re-sending after a
 * dropped answer doesn't prompt the tenant twice; "Send again" after an outcome is a new
 * request with a new key.
 */

const FIELDS = ['channelId', 'phone', 'amount'] as const;
type FieldName = (typeof FIELDS)[number];

export function StkRequestDialog({
  tenant,
  invoice,
  balance,
  onClose,
}: {
  tenant: MpesaTenantRef;
  /** Opened from an invoice: its balance is the amount and the payment goes to it first. */
  invoice?: { id: string; number: string; balance: number };
  /** Opened from a tenant: what they owe, as the suggested amount. */
  balance?: number | null;
  onClose: () => void;
}) {
  const canSeeChannels = useCan('channels:view');
  const channels = useChannels({ status: 'ACTIVE' }, canSeeChannels);
  const usable = stkChannels(channels.data ?? []);

  const [channelId, setChannelId] = useState('');
  const [phone, setPhone] = useState(tenant.phone ?? '');
  const [amount, setAmount] = useState(suggestStkAmount(invoice ? invoice.balance : balance));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<KeyedAttempt | null>(null);
  const [sent, setSent] = useState<{ request: StkRequest; startedAt: number } | null>(null);

  // One configured channel: nothing to choose.
  const chosen = usable.find((c) => c.id === channelId) ?? (usable.length === 1 ? usable[0] : undefined);
  const parsed = parseAmount(amount);

  const send = useMutation({
    mutationFn: ({ body, key }: { body: Record<string, unknown>; key: string }) =>
      api.post<unknown>('/stk-requests', body, { headers: { 'Idempotency-Key': key } }),
    onSuccess: (response) => {
      setSent({ request: unwrap<StkRequest>(response), startedAt: Date.now() });
    },
    onError: (error) => {
      // 422s on amount / phone sit beside their fields; the rest is the general message.
      if (error instanceof ApiError && error.status === 422) {
        const byField = error.fieldErrors;
        const found: Partial<Record<FieldName, string>> = {};
        if (byField.amount) found.amount = 'M-Pesa takes whole shillings above zero.';
        if (byField.phone) found.phone = 'Enter a Safaricom number, e.g. 0712 345 678 or 0110 345 678.';
        if (byField.channelId) found.channelId = byField.channelId;
        if (Object.keys(found).length > 0) {
          setErrors(found);
          return;
        }
      }
      setGeneral(mpesaErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<FieldName, string>> = {};
    if (!chosen) found.channelId = 'Choose the M-Pesa channel the money goes to.';
    const checkedPhone = checkStkPhone(phone);
    if (!checkedPhone.ok) found.phone = checkedPhone.error;
    const checkedAmount = checkStkAmount(amount);
    if (!checkedAmount.ok) found.amount = checkedAmount.error;
    setErrors(found);
    setGeneral(null);
    if (!chosen || !checkedPhone.ok || !checkedAmount.ok) return;

    const body: Record<string, unknown> = {
      tenantId: tenant.id,
      channelId: chosen.id,
      amount: checkedAmount.minor,
      phone: checkedPhone.phone,
    };
    if (invoice) body.invoiceIds = [invoice.id];
    const next = keyFor(attempt, signatureOf(body), newKey);
    setAttempt(next);
    send.mutate({ body, key: next.key });
  };

  const again = () => {
    setSent(null);
    // The outcome is in: the next send is a new prompt, so it needs a new key.
    setAttempt(null);
    setGeneral(null);
    send.reset();
  };

  if (sent) {
    return <StkProgress first={sent.request} startedAt={sent.startedAt} onAgain={again} onClose={onClose} />;
  }

  const noChannels = canSeeChannels && channels.isSuccess && usable.length === 0;

  return (
    <Sheet
      title={invoice ? `Request M-Pesa payment — ${invoice.number}` : 'Request M-Pesa payment'}
      busy={send.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={send.isPending}>Cancel</button>
          <button type="submit" form="stk-form" className="nx-btn nx-btn--primary" disabled={send.isPending || usable.length === 0}>
            {send.isPending ? 'Sending…' : parsed.ok && parsed.minor > 0 ? `Send prompt for ${formatKES(parsed.minor)}` : 'Send prompt'}
          </button>
        </>
      )}
    >
      <form id="stk-form" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">
          {personName(tenant)} gets an M-Pesa prompt on their phone and pays by entering their PIN. The payment is recorded
          and receipted automatically{invoice ? `, paying ${invoice.number} first` : ', oldest invoice first'}.
        </p>

        {!canSeeChannels ? (
          <p className="ad__error" role="alert">Your role cannot list payment channels, so it cannot send payment prompts.</p>
        ) : channels.isError ? (
          <p className="ad__error" role="alert">{mpesaErrorMessage(channels.error)}</p>
        ) : noChannels ? (
          <p className="ad__callout ad__callout--info" role="note">
            No M-Pesa channel is connected yet. Add the Daraja keys to a paybill or till under{' '}
            <Link to="/app/payment-channels" onClick={onClose}>Money → Payment channels</Link> first.
          </p>
        ) : null}

        <div className="fm__grid sheet-grid">
          {usable.length > 1 ? (
            <Field id="stk-channel" label="Pay into" error={errors.channelId}
              hint={chosen ? channelDetails(chosen) : undefined}>
              <select id="stk-channel" value={channelId} aria-invalid={Boolean(errors.channelId)} onChange={(e) => setChannelId(e.target.value)}>
                <option value="">Choose…</option>
                {usable.map((c) => <option key={c.id} value={c.id}>{c.name} ({CHANNEL_KIND[c.kind]?.label ?? c.kind})</option>)}
              </select>
            </Field>
          ) : chosen ? (
            <div className="fld">
              <span className="fld__label">Pay into</span>
              <span className="mp__fixed">{chosen.name} <span className="ad__muted num">{channelDetails(chosen)}</span></span>
            </div>
          ) : channels.isPending && canSeeChannels ? (
            <div className="fld"><span className="fld__label">Pay into</span><span className="ad__muted" role="status">Loading channels…</span></div>
          ) : null}
          <Field id="stk-phone" label="M-Pesa phone number" error={errors.phone} hint="Kenyan mobile, e.g. 0712 345 678. The tenant’s number is filled in.">
            <input id="stk-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} maxLength={20} aria-invalid={Boolean(errors.phone)}
              onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field id="stk-amount" label="Amount" error={errors.amount}
            hint={invoice ? `The invoice balance is ${formatKES(invoice.balance)}. Whole shillings only.` : 'Whole shillings only, e.g. 25,000.'}>
            <input id="stk-amount" inputMode="numeric" autoComplete="off" value={amount} aria-invalid={Boolean(errors.amount)}
              onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>

        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

/** The request after it went out: polled every 3 s while pending, for about three minutes. */
function StkProgress({ first, startedAt: initialStart, onAgain, onClose }: {
  first: StkRequest;
  startedAt: number;
  onAgain: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { stk, status, waiting, gaveUp, checkAgain } = useStkFollow({
    queryKey: [...keys.stk, first.id],
    fetchStk: () => api.get<unknown>(`/stk-requests/${first.id}`).then((body) => unwrap<StkRequest>(body)),
    first,
    startedAt: initialStart,
  });

  // Paid: balances, invoices and the payments list have all changed.
  useEffect(() => {
    if (stk.state !== 'SUCCESS') return;
    void Promise.all([...AFTER_PAYMENT_KEYS, keys.inbound].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  }, [stk.state, queryClient]);

  return (
    <Sheet
      title="M-Pesa payment request"
      onClose={onClose}
      footer={(
        <>
          {!waiting ? <button type="button" className="nx-btn" onClick={onAgain}>{stk.state === 'SUCCESS' ? 'Request another' : 'Send again'}</button> : null}
          {waiting && gaveUp ? <button type="button" className="nx-btn" onClick={checkAgain} disabled={status.isFetching}>Check again</button> : null}
          <button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>{waiting ? 'Close' : 'Done'}</button>
        </>
      )}
    >
      <div className={`mp__stk mp__stk--${stk.state.toLowerCase()}`} role="status" aria-live="polite">
        <div className="mp__stkhead">
          {waiting && !gaveUp ? <span className="mp__spinner" aria-hidden="true" /> : null}
          <Badge table={STK_STATE} value={stk.state} />
          <strong className="num">{formatKES(stk.amount)}</strong>
        </div>
        <p className="mp__stkmsg">
          {waiting && gaveUp
            ? 'Still waiting. The tenant hasn’t answered yet — if they pay, it will update automatically and the payment is recorded without you.'
            : describeStk(stk)}
        </p>
        <dl className="pf__facts mp__stkfacts">
          <div><dt>Tenant</dt><dd>{personName(stk.tenant)} <span className="ad__muted num">{stk.tenant.code}</span></dd></div>
          <div><dt>Phone</dt><dd className="num">{stk.phone}</dd></div>
          <div><dt>Into</dt><dd>{stk.channel.name}</dd></div>
          {stk.accountRef ? <div><dt>Account</dt><dd className="num">{stk.accountRef}</dd></div> : null}
          <div><dt>Sent</dt><dd>{formatDateTime(stk.createdAt)}</dd></div>
          {stk.completedAt ? <div><dt>Finished</dt><dd>{formatDateTime(stk.completedAt)}</dd></div> : null}
        </dl>
        {stk.state === 'SUCCESS' ? (
          stk.paymentId ? (
            <p>
              Recorded as a payment —{' '}
              <Link to={`/app/payments/${stk.paymentId}`} onClick={onClose}>see the payment and receipt</Link>.
            </p>
          ) : (
            <p className="ad__muted">The payment is being recorded; it will appear under Payments shortly.</p>
          )
        ) : null}
        {waiting && !gaveUp ? (
          <p className="ad__muted">You can close this — the payment is recorded automatically when the tenant pays.</p>
        ) : null}
        {status.isError ? <p className="fld__err">Couldn’t check the request just now: {mpesaErrorMessage(status.error)}</p> : null}
      </div>
    </Sheet>
  );
}
