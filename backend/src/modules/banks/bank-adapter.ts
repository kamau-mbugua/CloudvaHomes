import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseStatementAmount } from './statement-csv.js';

/** One credit a bank (or middleware) told us about. */
export interface BankCredit {
  transactionId: string;
  amount: bigint; // cents, > 0
  reference: string;
  payerName: string | null;
  payerAccount: string | null;
  occurredAt: Date;
}

/**
 * One bank's push notifications (design §5.2). Each bank gets its own implementation once
 * the owner picks banks and gets partner access; `HODI_JSON` is Hodi's own signed format for
 * banks or middleware that can post to us. A statement API would add `fetchStatement(range)`.
 */
export interface BankAdapter {
  readonly code: string;
  readonly name: string;
  /** True when the request was signed with `secret` (and isn't stale). */
  verify(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    secret: string,
    now?: Date,
  ): boolean;
  /** Credits in the body; throws on a body this adapter can't read. */
  parse(rawBody: Buffer): BankCredit[];
}

export class BankPayloadError extends Error {}

/** Signatures older than this are refused (replays of an old capture). */
export const SIGNATURE_WINDOW_SECONDS = 300;

const header = (h: Record<string, string | string[] | undefined>, name: string) => {
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Hodi's JSON webhook:
 *   X-Hodi-Timestamp: <unix seconds>
 *   X-Hodi-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with the secret>
 *   { "transactions": [{ "id", "amount": "1500.00", "reference", "payerName"?, "payerAccount"?, "occurredAt": ISO }] }
 */
export const hodiJsonAdapter: BankAdapter = {
  code: 'HODI_JSON',
  name: 'Hodi signed JSON',

  verify(headers, rawBody, secret, now = new Date()) {
    const ts = header(headers, 'x-hodi-timestamp');
    const sig = header(headers, 'x-hodi-signature');
    if (!ts || !sig || !/^\d{9,11}$/.test(ts) || !sig.startsWith('sha256=')) return false;
    if (Math.abs(now.getTime() / 1000 - Number(ts)) > SIGNATURE_WINDOW_SECONDS) return false;
    const expected = createHmac('sha256', secret).update(`${ts}.`).update(rawBody).digest();
    const given = Buffer.from(sig.slice('sha256='.length), 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  },

  parse(rawBody) {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BankPayloadError('Body is not JSON');
    }
    const list = (body as { transactions?: unknown })?.transactions;
    if (!Array.isArray(list) || list.length === 0 || list.length > 500) {
      throw new BankPayloadError('transactions must be a list of 1–500 items');
    }
    return list.map((t: Record<string, unknown>, i) => {
      const id = typeof t.id === 'string' ? t.id.trim() : '';
      const amount =
        typeof t.amount === 'string' || typeof t.amount === 'number'
          ? parseStatementAmount(String(t.amount))
          : null;
      const occurredAt = typeof t.occurredAt === 'string' ? new Date(t.occurredAt) : null;
      if (!id || id.length > 100) throw new BankPayloadError(`transactions[${i}].id is required`);
      if (amount === null || amount <= 0n)
        throw new BankPayloadError(`transactions[${i}].amount must be a positive amount`);
      if (!occurredAt || Number.isNaN(occurredAt.getTime()))
        throw new BankPayloadError(`transactions[${i}].occurredAt must be a date`);
      const str = (v: unknown) =>
        typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;
      return {
        transactionId: id.toUpperCase(),
        amount,
        reference: str(t.reference) ?? '',
        payerName: str(t.payerName),
        payerAccount: str(t.payerAccount),
        occurredAt,
      };
    });
  },
};

const ADAPTERS = new Map<string, BankAdapter>([[hodiJsonAdapter.code, hodiJsonAdapter]]);

export const bankAdapterCodes = () => [...ADAPTERS.keys()];
export const bankAdapter = (code: string | null | undefined) =>
  code ? ADAPTERS.get(code) : undefined;
