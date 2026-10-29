import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BankPayloadError, hodiJsonAdapter } from './bank-adapter.js';

const secret = 'test-secret-value';
const body = Buffer.from(
  JSON.stringify({
    transactions: [
      {
        id: 'ft2610050001',
        amount: '1,500.00',
        reference: 'T00001 rent',
        payerName: 'Tom',
        occurredAt: '2026-10-05T09:00:00+03:00',
      },
    ],
  }),
);
const now = new Date('2026-10-05T06:01:00Z');
const ts = String(Math.floor(now.getTime() / 1000) - 30);
const sign = (t: string, b: Buffer, s = secret) =>
  `sha256=${createHmac('sha256', s).update(`${t}.`).update(b).digest('hex')}`;

describe('HODI_JSON adapter', () => {
  it('accepts a fresh, correctly signed body', () => {
    expect(
      hodiJsonAdapter.verify(
        { 'x-hodi-timestamp': ts, 'x-hodi-signature': sign(ts, body) },
        body,
        secret,
        now,
      ),
    ).toBe(true);
  });
  it('refuses a wrong secret, a changed body, a stale timestamp and missing headers', () => {
    expect(
      hodiJsonAdapter.verify(
        { 'x-hodi-timestamp': ts, 'x-hodi-signature': sign(ts, body, 'other') },
        body,
        secret,
        now,
      ),
    ).toBe(false);
    const changed = Buffer.from(body.toString().replace('1,500.00', '9,500.00'));
    expect(
      hodiJsonAdapter.verify(
        { 'x-hodi-timestamp': ts, 'x-hodi-signature': sign(ts, body) },
        changed,
        secret,
        now,
      ),
    ).toBe(false);
    const old = String(Math.floor(now.getTime() / 1000) - 400);
    expect(
      hodiJsonAdapter.verify(
        { 'x-hodi-timestamp': old, 'x-hodi-signature': sign(old, body) },
        body,
        secret,
        now,
      ),
    ).toBe(false);
    expect(hodiJsonAdapter.verify({}, body, secret, now)).toBe(false);
    expect(
      hodiJsonAdapter.verify(
        { 'x-hodi-timestamp': ts, 'x-hodi-signature': 'sha256=zz' },
        body,
        secret,
        now,
      ),
    ).toBe(false);
  });
  it('parses credits and rejects bad items', () => {
    expect(hodiJsonAdapter.parse(body)).toEqual([
      {
        transactionId: 'FT2610050001',
        amount: 150000n,
        reference: 'T00001 rent',
        payerName: 'Tom',
        payerAccount: null,
        occurredAt: new Date('2026-10-05T06:00:00Z'),
      },
    ]);
    expect(() =>
      hodiJsonAdapter.parse(
        Buffer.from('{"transactions":[{"id":"x","amount":"-5","occurredAt":"2026-10-05"}]}'),
      ),
    ).toThrow(BankPayloadError);
    expect(() => hodiJsonAdapter.parse(Buffer.from('nope'))).toThrow(BankPayloadError);
  });
});
