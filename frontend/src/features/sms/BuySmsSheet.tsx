import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { formatKES } from '../../lib/money';
import { Sheet } from '../../components/Sheet';
import { checkStkPhone, keyFor, newKey, signatureOf } from '../mpesa/rules';
import type { KeyedAttempt } from '../mpesa/rules';
import type { StkState } from '../mpesa/types';
import { useStkFollow } from '../mpesa/useStkFollow';
import { unwrap } from '../payments/rules';
import { Field } from '../portfolio/ui';
import { smsErrorMessage, smsKeys, useSmsQuote } from './api';
import { bundleAmount, purchaseStkState } from './rules';
import type { SmsPurchase } from './types';

/**
 * "Buy SMS" (`POST /sms/buy`): pick a bundle or type a number of units, then an M-Pesa prompt
 * to KodiHub's paybill, followed until paid (`GET /sms/buy/:id`). Units are added when M-Pesa
 * confirms. Same Idempotency-Key while the input is unchanged, so a retry never prompts twice.
 */
export function BuySmsSheet({ ownPhone, onClose }: { ownPhone: string | null; onClose: () => void }) {
  const quote = useSmsQuote();
  const [choice, setChoice] = useState<number | 'other' | null>(null);
  const [other, setOther] = useState('');
  const [phone, setPhone] = useState(ownPhone ?? '');
  const [errors, setErrors] = useState<{ units?: string; phone?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<KeyedAttempt | null>(null);
  const [sent, setSent] = useState<{ purchase: SmsPurchase; startedAt: number } | null>(null);

  const price = quote.data ? Number(quote.data.unitPrice) : 0;
  const picked = choice ?? quote.data?.bundles[0]?.units ?? null;
  const units = picked === 'other' ? Number(other.replace(/[,\s]/g, '')) : (picked ?? 0);
  const total = units > 0 && Number.isInteger(units) ? bundleAmount(units, price) : 0;

  const buy = useMutation({
    mutationFn: ({ body, key }: { body: Record<string, unknown>; key: string }) =>
      api.post<unknown>('/sms/buy', body, { headers: { 'Idempotency-Key': key } }),
    onSuccess: (response) => setSent({ purchase: unwrap<SmsPurchase>(response), startedAt: Date.now() }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const byField = error.fieldErrors;
        if (byField.units || byField.phone) {
          setErrors({ units: byField.units, phone: byField.phone ? 'Enter a Safaricom number, e.g. 0712 345 678.' : undefined });
          return;
        }
      }
      setGeneral(smsErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const found: { units?: string; phone?: string } = {};
    const min = quote.data?.minUnits ?? 1;
    if (!Number.isInteger(units) || units <= 0) found.units = 'Enter a whole number of units.';
    else if (units < min) found.units = `Buy at least ${min.toLocaleString('en-KE')} units.`;
    const checkedPhone = phone.trim() ? checkStkPhone(phone) : null;
    if (checkedPhone && !checkedPhone.ok) found.phone = checkedPhone.error;
    setErrors(found);
    if (found.units || found.phone) return;
    const body: Record<string, unknown> = { units };
    if (checkedPhone?.ok) body.phone = checkedPhone.phone;
    const next = keyFor(attempt, signatureOf(body), newKey);
    setAttempt(next);
    buy.mutate({ body, key: next.key });
  };

  if (sent) {
    return (
      <BuyProgress
        first={sent.purchase}
        startedAt={sent.startedAt}
        onAgain={() => {
          setSent(null);
          setAttempt(null);
          buy.reset();
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet
      title="Buy SMS units"
      busy={buy.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={buy.isPending}>Cancel</button>
          <button type="submit" form="sms-buy" className="nx-btn nx-btn--primary" disabled={buy.isPending || !quote.data}>
            {buy.isPending ? 'Sending…' : total > 0 ? `Pay ${formatKES(total)} with M-Pesa` : 'Pay with M-Pesa'}
          </button>
        </>
      )}
    >
      <form id="sms-buy" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">
          {quote.data
            ? `One unit is one SMS of up to 160 characters, at ${formatKES(price)} per unit. An M-Pesa prompt goes to the phone below; the units are added as soon as you pay.`
            : 'Loading prices…'}
        </p>
        {quote.isError ? <p className="ad__error" role="alert">{smsErrorMessage(quote.error)}</p> : null}
        {quote.data ? (
          <fieldset className="sms__bundles">
            <legend>How many units</legend>
            {quote.data.bundles.map((b) => (
              <label key={b.units} className="sms__bundle">
                <input type="radio" name="sms-bundle" checked={picked === b.units} onChange={() => setChoice(b.units)} />
                <span><strong className="num">{b.units.toLocaleString('en-KE')}</strong> units</span>
                <span className="num">{formatKES(Number(b.amount))}</span>
              </label>
            ))}
            <label className="sms__bundle">
              <input type="radio" name="sms-bundle" checked={picked === 'other'} onChange={() => setChoice('other')} />
              <span>Another number</span>
            </label>
            {picked === 'other' ? (
              <Field id="sms-units" label="Units" error={errors.units}
                hint={`At least ${quote.data.minUnits.toLocaleString('en-KE')} units.${total > 0 ? ` Costs ${formatKES(total)}.` : ''}`}>
                <input id="sms-units" inputMode="numeric" autoComplete="off" value={other} aria-invalid={Boolean(errors.units)}
                  onChange={(e) => setOther(e.target.value)} />
              </Field>
            ) : errors.units ? <p className="fld__err">{errors.units}</p> : null}
          </fieldset>
        ) : null}
        <Field id="sms-phone" label="M-Pesa phone number" error={errors.phone} hint="Your number is filled in. Change it to pay from another phone.">
          <input id="sms-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={20} aria-invalid={Boolean(errors.phone)}
            onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

type Followed = Omit<SmsPurchase, 'state'> & { state: StkState; purchaseState: SmsPurchase['state'] };
const followed = (p: SmsPurchase): Followed => ({ ...p, purchaseState: p.state, state: purchaseStkState(p.state) });

function BuyProgress({ first, startedAt, onAgain, onClose }: {
  first: SmsPurchase;
  startedAt: number;
  onAgain: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { stk, status, waiting, gaveUp, checkAgain } = useStkFollow<Followed>({
    queryKey: [...smsKeys.all, 'buy', first.id],
    fetchStk: () => api.get<unknown>(`/sms/buy/${encodeURIComponent(first.id)}`).then((b) => followed(unwrap<SmsPurchase>(b))),
    first: followed(first),
    startedAt,
  });

  useEffect(() => {
    if (stk.state !== 'SUCCESS') return;
    void queryClient.invalidateQueries({ queryKey: smsKeys.all, predicate: (q) => q.queryKey[1] !== 'buy' });
  }, [stk.state, queryClient]);

  const message = stk.state === 'SUCCESS'
    ? `Done — ${stk.units.toLocaleString('en-KE')} SMS units added.`
    : stk.state === 'PENDING'
      ? gaveUp
        ? 'Still waiting for M-Pesa. If you paid, the units will show shortly — you don’t need to pay again.'
        : 'Check your phone and enter your M-Pesa PIN.'
      : 'The payment didn’t go through, so no units were added. You can try again.';

  return (
    <Sheet
      title="Buying SMS units"
      onClose={onClose}
      footer={(
        <>
          {!waiting ? <button type="button" className="nx-btn" onClick={onAgain}>{stk.state === 'SUCCESS' ? 'Buy more' : 'Try again'}</button> : null}
          {waiting && gaveUp ? <button type="button" className="nx-btn" onClick={checkAgain} disabled={status.isFetching}>Check again</button> : null}
          <button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>{waiting ? 'Close' : 'Done'}</button>
        </>
      )}
    >
      <div className={`mp__stk mp__stk--${stk.state.toLowerCase()}`} role="status" aria-live="polite">
        <div className="mp__stkhead">
          {waiting && !gaveUp ? <span className="mp__spinner" aria-hidden="true" /> : null}
          <strong className="num">{stk.units.toLocaleString('en-KE')} units · {formatKES(Number(stk.amount))}</strong>
        </div>
        <p className="mp__stkmsg">{message}</p>
        {stk.mpesaReceipt ? <p className="ad__muted">M-Pesa receipt <span className="num">{stk.mpesaReceipt}</span></p> : null}
        {waiting && !gaveUp ? <p className="ad__muted">You can close this. The units are added automatically when you pay.</p> : null}
        {status.isError ? <p className="fld__err">Couldn’t check just now: {smsErrorMessage(status.error)}</p> : null}
      </div>
    </Sheet>
  );
}
