import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { reloadSessionDetails } from '../../lib/auth/session';
import { formatDateTime } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { Sheet } from '../../components/Sheet';
import { STK_STATE } from '../mpesa/labels';
import { checkStkAmount, checkStkPhone, describeStk, keyFor, newKey, signatureOf, suggestStkAmount } from '../mpesa/rules';
import type { KeyedAttempt } from '../mpesa/rules';
import { useStkFollow } from '../mpesa/useStkFollow';
import { unwrap } from '../payments/rules';
import { Badge, Field } from '../portfolio/ui';
import { keys, platformErrorMessage } from './api';
import { stkView } from './rules';
import type { PlatformStk } from './types';

/**
 * "Pay now" for the organisation's Hodi bill (`POST /billing/pay`): an M-Pesa prompt to the
 * payer's phone from Hodi's own paybill, then followed (`GET /billing/pay/:id` every 3 s)
 * until they pay, cancel or let it lapse — the same flow as the tenant portal's "Pay now".
 * Hodi records the payment, pays the oldest invoice first and lifts a suspension; closing
 * this stops only the watching.
 *
 * The `Idempotency-Key` stays the same while the input does, so pressing Pay again after
 * a dropped answer doesn't prompt twice; "Try again" after an outcome is a new key.
 */
export function PayHodiSheet({ owed, ownPhone, onClose }: {
  /** What to suggest, rounded up to whole shillings. */
  owed: number;
  /** The number the prompt goes to by default. */
  ownPhone: string | null;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(suggestStkAmount(owed));
  const [phone, setPhone] = useState(ownPhone ?? '');
  const [errors, setErrors] = useState<{ amount?: string; phone?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<KeyedAttempt | null>(null);
  const [sent, setSent] = useState<{ request: PlatformStk; startedAt: number } | null>(null);
  const parsed = parseAmount(amount);

  const send = useMutation({
    mutationFn: ({ body, key }: { body: Record<string, unknown>; key: string }) =>
      api.post<unknown>('/billing/pay', body, { headers: { 'Idempotency-Key': key } }),
    onSuccess: (response) => setSent({ request: unwrap<PlatformStk>(response), startedAt: Date.now() }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const byField = error.fieldErrors;
        const found: { amount?: string; phone?: string } = {};
        if (byField.amount) found.amount = 'M-Pesa takes whole shillings above zero.';
        if (byField.phone) found.phone = 'Enter a Safaricom number, e.g. 0712 345 678.';
        if (found.amount || found.phone) {
          setErrors(found);
          return;
        }
      }
      setGeneral(platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const found: { amount?: string; phone?: string } = {};
    const checkedAmount = checkStkAmount(amount);
    if (!checkedAmount.ok) found.amount = checkedAmount.error;
    // Optional: without one, the server uses the number it has for the organisation.
    const checkedPhone = phone.trim() ? checkStkPhone(phone) : null;
    if (checkedPhone && !checkedPhone.ok) found.phone = checkedPhone.error;
    setErrors(found);
    if (!checkedAmount.ok || (checkedPhone && !checkedPhone.ok)) return;

    const body: Record<string, unknown> = { amount: checkedAmount.minor };
    if (checkedPhone?.ok) body.phone = checkedPhone.phone;
    const next = keyFor(attempt, signatureOf(body), newKey);
    setAttempt(next);
    send.mutate({ body, key: next.key });
  };

  const again = () => {
    setSent(null);
    setAttempt(null);
    setGeneral(null);
    send.reset();
  };

  if (sent) return <PayProgress first={sent.request} startedAt={sent.startedAt} onAgain={again} onClose={onClose} />;

  return (
    <Sheet
      title="Pay your Hodi bill"
      busy={send.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={send.isPending}>Cancel</button>
          <button type="submit" form="hodi-pay" className="nx-btn nx-btn--primary" disabled={send.isPending}>
            {send.isPending ? 'Sending…' : parsed.ok && parsed.minor > 0 ? `Pay ${formatKES(parsed.minor)}` : 'Pay'}
          </button>
        </>
      )}
    >
      <form id="hodi-pay" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">
          An M-Pesa prompt goes to the phone below. Enter the M-Pesa PIN to pay Hodi. The payment pays the oldest Hodi
          invoice first; anything extra is kept as credit for the next one.
        </p>
        <div className="fm__grid sheet-grid">
          <Field id="hp-amount" label="Amount (KES)" error={errors.amount}
            hint={owed > 0 ? `You owe ${formatKES(owed)}. Whole shillings only.` : 'Whole shillings only.'}>
            <input id="hp-amount" inputMode="numeric" autoComplete="off" value={amount} aria-invalid={Boolean(errors.amount)}
              onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="hp-phone" label="M-Pesa phone number" error={errors.phone} hint="Your number is filled in. Change it to pay from another phone.">
            <input id="hp-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={20} aria-invalid={Boolean(errors.phone)}
              onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

function PayProgress({ first, startedAt, onAgain, onClose }: {
  first: PlatformStk;
  startedAt: number;
  onAgain: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { stk, status, waiting, gaveUp, checkAgain } = useStkFollow<PlatformStk>({
    queryKey: [...keys.billing, 'pay', first.id],
    fetchStk: () => api.get<unknown>(`/billing/pay/${encodeURIComponent(first.id)}`).then((body) => unwrap<PlatformStk>(body)),
    first,
    startedAt,
  });

  // Paid: the balance, invoices and payments changed, and so may the organisation's
  // status (a suspension is lifted) — the banner reads that from the session.
  useEffect(() => {
    if (stk.state !== 'SUCCESS') return;
    void queryClient.invalidateQueries({ queryKey: keys.billing, predicate: (query) => query.queryKey[1] !== 'pay' });
    void reloadSessionDetails();
  }, [stk.state, queryClient]);

  return (
    <Sheet
      title="M-Pesa payment to Hodi"
      onClose={onClose}
      footer={(
        <>
          {!waiting ? <button type="button" className="nx-btn" onClick={onAgain}>{stk.state === 'SUCCESS' ? 'Pay more' : 'Try again'}</button> : null}
          {waiting && gaveUp ? <button type="button" className="nx-btn" onClick={checkAgain} disabled={status.isFetching}>Check again</button> : null}
          <button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>{waiting ? 'Close' : 'Done'}</button>
        </>
      )}
    >
      <div className={`mp__stk mp__stk--${stk.state.toLowerCase()}`} role="status" aria-live="polite">
        <div className="mp__stkhead">
          {waiting && !gaveUp ? <span className="mp__spinner" aria-hidden="true" /> : null}
          <Badge table={STK_STATE} value={stk.state} />
          {typeof stk.amount === 'number' ? <strong className="num">{formatKES(stk.amount)}</strong> : null}
        </div>
        <p className="mp__stkmsg">
          {waiting && gaveUp
            ? 'Still waiting for M-Pesa. If you paid, it will show here shortly — you don’t need to pay again.'
            : describeStk(stkView(stk), 'tenant')}
        </p>
        <dl className="pf__facts mp__stkfacts">
          {stk.phone ? <div><dt>Phone</dt><dd className="num">{stk.phone}</dd></div> : null}
          {stk.accountRef ? <div><dt>Account</dt><dd className="num">{stk.accountRef}</dd></div> : null}
          {stk.createdAt ? <div><dt>Sent</dt><dd>{formatDateTime(stk.createdAt)}</dd></div> : null}
        </dl>
        {stk.state === 'SUCCESS' ? <p className="ad__muted">The payment shows under Payments on this page.</p> : null}
        {waiting && !gaveUp ? <p className="ad__muted">You can close this. The payment is recorded automatically when you pay.</p> : null}
        {status.isError ? <p className="fld__err">Couldn’t check just now: {platformErrorMessage(status.error)}</p> : null}
      </div>
    </Sheet>
  );
}
