import { toMilli } from '../billing/billing-math.js';

/** Pure Daraja helpers: formats, payload parsing, account references. No I/O. */

export interface DarajaCredentials {
  consumerKey: string;
  consumerSecret: string;
  passkey?: string;
  /** Tills: the head-office (store) number STK pushes are addressed to. */
  storeNumber?: string;
}

const NAIROBI = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Daraja timestamps: yyyyMMddHHmmss in Nairobi time. */
export function darajaTimestamp(now = new Date()): string {
  const p = Object.fromEntries(NAIROBI.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

/** "20261027143015" (Nairobi) → Date. Nairobi has no DST: always UTC+3. */
export function parseDarajaTime(text: string | number): Date {
  const t = String(text);
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(t);
  if (!m) throw new RangeError(`Not a Daraja timestamp: ${t}`);
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  return new Date(Date.UTC(y!, mo! - 1, d!, h! - 3, mi!, s!));
}

/** STK password: base64(shortcode + passkey + timestamp). */
export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/** "+254712345678" → "254712345678" (the form Daraja wants). */
export function toMsisdn(e164: string): string {
  return e164.replace(/^\+/, '');
}

/** "10.00" / 10 → 1000n cents. */
export function kesToCents(value: string | number): bigint {
  const milli = toMilli(typeof value === 'number' ? value.toFixed(2) : value);
  return milli / 10n;
}

/** Account references as people type them: upper-case, no spaces, dashes or dots. */
export function normalizeAccountRef(ref: string | null | undefined): string {
  return (ref ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
}

/** A JSON scalar as text ("" for anything else), so objects never become "[object Object]". */
function text(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' ? String(v) : '';
}

export interface StkCallback {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: string;
  resultDesc: string;
  receipt: string | null;
  amount: bigint | null;
  phone: string | null;
  occurredAt: Date | null;
}

/** Body.stkCallback → fields, or null if it isn't one. */
export function parseStkCallback(body: unknown): StkCallback | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string') return null;
  const items = (
    (cb.CallbackMetadata as { Item?: { Name: string; Value?: unknown }[] })?.Item ?? []
  ).reduce<Record<string, unknown>>((acc, i) => ({ ...acc, [i.Name]: i.Value }), {});
  return {
    merchantRequestId: text(cb.MerchantRequestID),
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: text(cb.ResultCode),
    resultDesc: text(cb.ResultDesc),
    receipt: typeof items.MpesaReceiptNumber === 'string' ? items.MpesaReceiptNumber : null,
    amount: items.Amount !== undefined ? kesToCents(text(items.Amount)) : null,
    phone: items.PhoneNumber !== undefined ? `+${text(items.PhoneNumber)}` : null,
    occurredAt:
      items.TransactionDate !== undefined ? parseDarajaTime(text(items.TransactionDate)) : null,
  };
}

export interface C2bConfirmation {
  receipt: string;
  amount: bigint;
  shortcode: string;
  accountRef: string | null;
  phone: string | null;
  payerName: string | null;
  occurredAt: Date;
}

export function parseC2bConfirmation(body: unknown): C2bConfirmation | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.TransID !== 'string' || b.TransAmount === undefined) return null;
  const name = [b.FirstName, b.MiddleName, b.LastName]
    .filter((x) => typeof x === 'string' && x)
    .join(' ');
  const msisdn =
    typeof b.MSISDN === 'string' || typeof b.MSISDN === 'number' ? String(b.MSISDN) : null;
  return {
    receipt: b.TransID,
    amount: kesToCents(text(b.TransAmount)),
    shortcode: text(b.BusinessShortCode),
    accountRef:
      typeof b.BillRefNumber === 'string' && b.BillRefNumber.trim() ? b.BillRefNumber.trim() : null,
    // Safaricom masks or hashes MSISDN on some shortcodes; keep only a real number.
    phone: msisdn && /^2547\d{8}$|^2541\d{8}$/.test(msisdn) ? `+${msisdn}` : null,
    payerName: name || null,
    occurredAt: parseDarajaTime(text(b.TransTime)),
  };
}

/** STK result codes worth naming. */
export function stkStateFor(resultCode: string): 'SUCCESS' | 'CANCELLED' | 'TIMEOUT' | 'FAILED' {
  if (resultCode === '0') return 'SUCCESS';
  if (resultCode === '1032') return 'CANCELLED';
  if (resultCode === '1037') return 'TIMEOUT';
  return 'FAILED';
}
