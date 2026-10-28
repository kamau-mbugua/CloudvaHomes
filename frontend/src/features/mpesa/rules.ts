import { formatKES, minorToInput, parseAmount } from '../../lib/money';
import type { ChannelKind, DarajaEnvironment, PaymentChannel } from '../payments/types';
import type { StkRequest, StkState } from './types';

/**
 * Pure M-Pesa rules the screens share: phone numbers, STK amounts and polling, the
 * idempotency key, the Daraja set-up form and small display helpers. No React, money only
 * as integer cents, so each is tested on its own.
 */

// ---------------------------------------------------------------- channels

export function isMpesaKind(kind: ChannelKind | null | undefined): boolean {
  return kind === 'MPESA_PAYBILL' || kind === 'MPESA_TILL';
}

/**
 * Channels a payment request (STK push) can go out on: active M-Pesa channels whose
 * Daraja keys are saved, by name. Whether the passkey is there too is only known to the
 * server, which answers `DARAJA_NOT_CONFIGURED` if not.
 */
export function stkChannels<T extends Pick<PaymentChannel, 'kind' | 'status' | 'name' | 'daraja'>>(channels: readonly T[]): T[] {
  return channels
    .filter((c) => c.status === 'ACTIVE' && isMpesaKind(c.kind) && Boolean(c.daraja?.configured))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "paybill" or "till" — for button labels like "Register paybill URLs". */
export function mpesaNoun(kind: ChannelKind): string {
  return kind === 'MPESA_TILL' ? 'till' : 'paybill';
}

// ---------------------------------------------------------------- phone

/**
 * A Kenyan mobile number as `+2547XXXXXXXX` (or `+2541…`), from what people type:
 * `0712 345 678`, `254712345678`, `+254 712 345 678`. Null when it isn't one.
 */
export function normaliseKenyanPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, '');
  const match = /^(?:\+254|254|0)([17]\d{8})$/.exec(compact);
  return match ? `+254${match[1]}` : null;
}

export function checkStkPhone(input: string): { ok: true; phone: string } | { ok: false; error: string } {
  if (!input.trim()) return { ok: false, error: 'Enter the M-Pesa phone number the prompt goes to.' };
  const phone = normaliseKenyanPhone(input);
  if (!phone) return { ok: false, error: 'Enter a Kenyan mobile number, e.g. 0712 345 678 or +254 712 345 678.' };
  return { ok: true, phone };
}

// ---------------------------------------------------------------- amount

/** An STK amount: above zero and in whole shillings — M-Pesa takes no cents. */
export function checkStkAmount(input: string): { ok: true; minor: number } | { ok: false; error: string } {
  const parsed = parseAmount(input);
  if (!parsed.ok) return parsed;
  if (parsed.minor <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  if (parsed.minor % 100 !== 0) {
    return { ok: false, error: `M-Pesa takes whole shillings only, e.g. ${formatKES(Math.ceil(parsed.minor / 100) * 100)}.` };
  }
  return parsed;
}

/** A balance as a whole-shilling amount to suggest: rounded up, so the invoice is cleared. Blank when nothing is owed. */
export function suggestStkAmount(minor: number | null | undefined): string {
  if (!minor || minor <= 0) return '';
  return minorToInput(Math.ceil(minor / 100) * 100);
}

// ---------------------------------------------------------------- STK polling

/** Ask again this often while the tenant has their phone in hand. */
export const STK_POLL_MS = 3_000;
/** Stop asking after this long; the server's sweep job finishes it off on its own. */
export const STK_WAIT_MS = 3 * 60_000;

export function isFinalStk(state: StkState): boolean {
  return state !== 'PENDING';
}

/** When to ask for the request's state again: every 3 s while pending, never after ~3 min. */
export function stkPollDelay(state: StkState | undefined, startedAt: number, now: number): number | false {
  if (state && isFinalStk(state)) return false;
  if (now - startedAt >= STK_WAIT_MS) return false;
  return STK_POLL_MS;
}

/** Whether waiting has gone on long enough to stop polling and say so. */
export function stkWaitedTooLong(state: StkState | undefined, startedAt: number, now: number): boolean {
  return state === 'PENDING' && now - startedAt >= STK_WAIT_MS;
}

/**
 * One line on where a request stands. Staff read it about the tenant; in the tenant
 * portal (`audience: 'tenant'`) it speaks to the person holding the phone.
 */
export function describeStk(
  stk: Pick<StkRequest, 'state' | 'phone' | 'amount' | 'resultDesc' | 'mpesaReceipt'>,
  audience: 'staff' | 'tenant' = 'staff',
): string {
  const you = audience === 'tenant';
  switch (stk.state) {
    case 'PENDING':
      return you
        ? `Check your phone. An M-Pesa prompt for ${formatKES(stk.amount)} was sent to ${stk.phone}. Enter your M-Pesa PIN to pay.`
        : `Check your phone… A prompt for ${formatKES(stk.amount)} was sent to ${stk.phone}. Waiting for the tenant to enter their M-Pesa PIN.`;
    case 'SUCCESS':
      return `${you ? 'Paid, thank you' : 'Paid'}${stk.mpesaReceipt ? ` — M-Pesa receipt ${stk.mpesaReceipt}` : ''}.`;
    case 'CANCELLED':
      return you
        ? `The prompt was cancelled${stk.resultDesc ? `: ${stk.resultDesc}` : ''}. Nothing was paid.`
        : `The tenant cancelled the prompt${stk.resultDesc ? `: ${stk.resultDesc}` : ''}.`;
    case 'FAILED':
      return `The payment did not go through${stk.resultDesc ? `: ${stk.resultDesc}` : ''}.`;
    case 'TIMEOUT':
      return you
        ? 'The prompt was not answered in time. Nothing was paid.'
        : 'The tenant did not answer the prompt in time. Nothing was paid.';
    default:
      return '';
  }
}

// ---------------------------------------------------------------- idempotency

export interface KeyedAttempt {
  signature: string;
  key: string;
}

/** The request body as a stable string: same input, same signature, whatever the key order. */
export function signatureOf(body: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(body).sort().map((k) => [k, body[k]]));
}

/**
 * The `Idempotency-Key` for sending `signature`: the previous key if the input is the
 * same (a retry after a dropped answer must not prompt the tenant twice), a new one once
 * anything changed.
 */
export function keyFor(previous: KeyedAttempt | null, signature: string, makeKey: () => string): KeyedAttempt {
  if (previous && previous.signature === signature) return previous;
  return { signature, key: makeKey() };
}

export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

// ---------------------------------------------------------------- Daraja set-up

export interface DarajaDraft {
  environment: DarajaEnvironment | '';
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  /** Tills only: the store (head office) number payment prompts go to, when it differs from the till. */
  storeNumber: string;
}

export interface DarajaBody {
  environment: DarajaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  passkey?: string;
  storeNumber?: string;
}

export type CheckedDaraja =
  | { ok: true; body: DarajaBody }
  | { ok: false; errors: Partial<Record<keyof DarajaDraft, string>> };

/**
 * The set-up form. Secrets are write-only, so every save sends them all again; the
 * passkey is optional (without it the channel only receives paybill / till payments and
 * can't send payment prompts). A till may also name its store number (5–7 digits);
 * other kinds never send one.
 */
export function checkDaraja(draft: DarajaDraft, kind: ChannelKind = 'MPESA_PAYBILL'): CheckedDaraja {
  const errors: Partial<Record<keyof DarajaDraft, string>> = {};
  if (draft.environment !== 'SANDBOX' && draft.environment !== 'PRODUCTION') errors.environment = 'Choose sandbox or production.';
  const consumerKey = draft.consumerKey.trim();
  const consumerSecret = draft.consumerSecret.trim();
  const passkey = draft.passkey.trim();
  if (!consumerKey) errors.consumerKey = 'Paste the consumer key from your Daraja app.';
  else if (/\s/.test(consumerKey)) errors.consumerKey = 'The consumer key has no spaces. Copy it again from the Daraja portal.';
  if (!consumerSecret) errors.consumerSecret = 'Paste the consumer secret from your Daraja app.';
  else if (/\s/.test(consumerSecret)) errors.consumerSecret = 'The consumer secret has no spaces. Copy it again from the Daraja portal.';
  if (passkey && /\s/.test(passkey)) errors.passkey = 'The passkey has no spaces. Copy it again from Safaricom’s email.';
  const storeNumber = kind === 'MPESA_TILL' ? draft.storeNumber.trim() : '';
  if (storeNumber && !/^\d{5,7}$/.test(storeNumber)) errors.storeNumber = 'Enter 5 to 7 digits.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      environment: draft.environment as DarajaEnvironment,
      consumerKey,
      consumerSecret,
      ...(passkey ? { passkey } : {}),
      ...(storeNumber ? { storeNumber } : {}),
    },
  };
}

// ---------------------------------------------------------------- display

/** The raw callback payload, pretty-printed for a <pre>. Strings that hold JSON are unpacked. */
export function prettyJson(raw: unknown): string {
  if (raw === undefined || raw === null) return 'Nothing was stored.';
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

/** The payer as M-Pesa named them: "JANE W. · +254700000001", or a dash. */
export function payerText(row: { payerName: string | null; payerPhone: string | null }): string {
  return [row.payerName?.trim(), row.payerPhone?.trim()].filter(Boolean).join(' · ') || '—';
}
