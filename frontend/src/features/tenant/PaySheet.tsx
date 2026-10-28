import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { formatDateTime } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { Sheet } from '../../components/Sheet';
import { STK_STATE } from '../mpesa/labels';
import { describeStk, keyFor, newKey, signatureOf, suggestStkAmount } from '../mpesa/rules';
import type { KeyedAttempt } from '../mpesa/rules';
import type { StkRequest } from '../mpesa/types';
import { useStkFollow } from '../mpesa/useStkFollow';
import { unwrap } from '../payments/rules';
import { Badge, Field } from '../portfolio/ui';
import { keys, payPath, payStatusPath, tenantErrorMessage } from './api';
import { checkPay } from './rules';

/**
 * "Pay now" (`POST /tenant/accounts/:id/pay`): an M-Pesa prompt to the tenant's own
 * phone, then followed (`GET …/pay/:stkId` every 3 s) until they pay, cancel or let it
 * lapse — the same flow as the staff "Request M-Pesa payment" dialog. The payment is
 * recorded by the server; closing this stops only the watching.
 *
 * The `Idempotency-Key` stays the same while the input does, so pressing Pay again after
 * a dropped answer doesn't prompt twice; "Try again" after an outcome is a new key.
 */
export function PaySheet({ tenantId, orgName, owed, ownPhone, title = 'Pay with M-Pesa', onClose }: {
  tenantId: string;
  orgName: string;
  /** What to suggest, rounded up to whole shillings. */
  owed: number;
  /** The number the prompt goes to by default. */
  ownPhone: string | null;
  title?: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(suggestStkAmount(owed));
  const [phone, setPhone] = useState(ownPhone ?? '');
  const [errors, setErrors] = useState<{ amount?: string; phone?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<KeyedAttempt | null>(null);
  const [sent, setSent] = useState<{ request: StkRequest; startedAt: number } | null>(null);
  const parsed = parseAmount(amount);

  const send = useMutation({
    mutationFn: ({ body, key }: { body: Record<string, unknown>; key: string }) =>
      api.post<unknown>(payPath(tenantId), body, { headers: { 'Idempotency-Key': key } }),
    onSuccess: (response) => setSent({ request: unwrap<StkRequest>(response), startedAt: Date.now() }),
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
      setGeneral(tenantErrorMessage(error, orgName));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkPay({ amount, phone });
    setGeneral(null);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    const next = keyFor(attempt, signatureOf(checked.body), newKey);
    setAttempt(next);
    send.mutate({ body: checked.body, key: next.key });
  };

  const again = () => {
    setSent(null);
    setAttempt(null);
    setGeneral(null);
    send.reset();
  };

  if (sent) return <PayProgress tenantId={tenantId} first={sent.request} startedAt={sent.startedAt} onAgain={again} onClose={onClose} />;

  return (
    <Sheet
      title={title}
      busy={send.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={send.isPending}>Cancel</button>
          <button type="submit" form="tp-pay" className="nx-btn nx-btn--primary nx-btn--lg tp__paysubmit" disabled={send.isPending}>
            {send.isPending ? 'Sending…' : parsed.ok && parsed.minor > 0 ? `Pay ${formatKES(parsed.minor)}` : 'Pay'}
          </button>
        </>
      )}
    >
      <form id="tp-pay" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">You’ll get an M-Pesa prompt on your phone. Enter your PIN to pay {orgName}. The receipt shows under Payments once it’s paid.</p>
        <div className="fm__grid sheet-grid">
          <Field id="tp-amount" label="Amount (KES)" error={errors.amount}
            hint={owed > 0 ? `You owe ${formatKES(owed)}. Whole shillings only.` : 'Whole shillings only. Anything extra is kept as credit.'}>
            <input id="tp-amount" className="tp__bigin" inputMode="numeric" autoComplete="off" value={amount} aria-invalid={Boolean(errors.amount)}
              onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="tp-phone" label="M-Pesa phone number" error={errors.phone} hint="Your number is filled in. Change it to pay from another phone.">
            <input id="tp-phone" className="tp__bigin" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={20} aria-invalid={Boolean(errors.phone)}
              onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

function PayProgress({ tenantId, first, startedAt, onAgain, onClose }: {
  tenantId: string;
  first: StkRequest;
  startedAt: number;
  onAgain: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { stk, status, waiting, gaveUp, checkAgain } = useStkFollow({
    queryKey: [...keys.account(tenantId), 'pay', first.id],
    fetchStk: () => api.get<unknown>(payStatusPath(tenantId, first.id)).then((body) => unwrap<StkRequest>(body)),
    first,
    startedAt,
  });

  // Paid: balance, invoices, statement and payments of this account have all changed.
  useEffect(() => {
    if (stk.state !== 'SUCCESS') return;
    void queryClient.invalidateQueries({
      queryKey: keys.account(tenantId),
      predicate: (query) => query.queryKey[2] !== 'pay',
    });
  }, [stk.state, queryClient, tenantId]);

  return (
    <Sheet
      title="M-Pesa payment"
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
          <strong className="num">{formatKES(stk.amount)}</strong>
        </div>
        <p className="mp__stkmsg">
          {waiting && gaveUp
            ? 'Still waiting for M-Pesa. If you paid, it will show on your account shortly — you don’t need to pay again.'
            : describeStk(stk, 'tenant')}
        </p>
        <dl className="pf__facts mp__stkfacts">
          <div><dt>Phone</dt><dd className="num">{stk.phone}</dd></div>
          {stk.accountRef ? <div><dt>Account</dt><dd className="num">{stk.accountRef}</dd></div> : null}
          <div><dt>Sent</dt><dd>{formatDateTime(stk.createdAt)}</dd></div>
        </dl>
        {stk.state === 'SUCCESS' ? <p className="ad__muted">Your receipt is under Payments.</p> : null}
        {waiting && !gaveUp ? <p className="ad__muted">You can close this. The payment is recorded automatically when you pay.</p> : null}
        {status.isError ? <p className="fld__err">Couldn’t check just now: {tenantErrorMessage(status.error)}</p> : null}
      </div>
    </Sheet>
  );
}
