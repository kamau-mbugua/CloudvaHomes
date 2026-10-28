import { describe, expect, it } from 'vitest';
import { ApiError, STEP_UP_REQUIRED } from '../../lib/api/client';
import type { PaymentChannel } from '../payments/types';
import { mpesaErrorMessage } from './api';
import {
  STK_POLL_MS, STK_WAIT_MS, checkDaraja, checkStkAmount, checkStkPhone, describeStk, isFinalStk, isMpesaKind, keyFor,
  mpesaNoun, normaliseKenyanPhone, payerText, prettyJson, signatureOf, stkChannels, stkPollDelay, stkWaitedTooLong,
} from './rules';

/** Synthetic data only: phones +2547000000xx, receipts TEST0000xx. */

const apiError = (code: string, status = 409, message = `server says ${code}`) => new ApiError({ status, code, message });

const channel = (over: Partial<PaymentChannel>): PaymentChannel => ({
  id: 'ch-1', kind: 'MPESA_PAYBILL', name: 'Main paybill', shortcode: '600000', bankName: null, accountNumber: null,
  accountName: null, propertyIds: [], status: 'ACTIVE', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  daraja: { configured: true, environment: 'SANDBOX', callbackUrls: null, c2bRegisteredAt: null },
  ...over,
});

describe('normaliseKenyanPhone', () => {
  it.each([
    ['0700000001', '+254700000001'],
    ['0700 000 001', '+254700000001'],
    ['254700000001', '+254700000001'],
    ['+254700000001', '+254700000001'],
    ['+254 700-000-001', '+254700000001'],
    ['0110000001', '+254110000001'],
    ['254110000001', '+254110000001'],
  ])('reads %s as %s', (input, expected) => {
    expect(normaliseKenyanPhone(input)).toBe(expected);
  });

  it.each(['', '700000001', '070000000', '07000000011', '+255700000001', '0200000001', '0800000001', '2547000000xx', '+254 7000'])(
    'rejects %s', (input) => {
      expect(normaliseKenyanPhone(input)).toBeNull();
    },
  );
});

describe('checkStkPhone', () => {
  it('asks for a number when blank', () => {
    expect(checkStkPhone('  ')).toEqual({ ok: false, error: expect.stringMatching(/Enter the M-Pesa phone/) });
  });
  it('explains the format when wrong', () => {
    expect(checkStkPhone('12345')).toEqual({ ok: false, error: expect.stringMatching(/Kenyan mobile/) });
  });
  it('returns the normalised number', () => {
    expect(checkStkPhone('0700 000 002')).toEqual({ ok: true, phone: '+254700000002' });
  });
});

describe('checkStkAmount', () => {
  it('takes whole shillings, with separators', () => {
    expect(checkStkAmount('25,000')).toEqual({ ok: true, minor: 2_500_000 });
    expect(checkStkAmount('1')).toEqual({ ok: true, minor: 100 });
  });
  it('refuses cents and suggests the next whole shilling', () => {
    const out = checkStkAmount('100.50');
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toMatch(/whole shillings.*KES 101\.00/);
  });
  it('refuses zero, blanks and nonsense', () => {
    expect(checkStkAmount('0').ok).toBe(false);
    expect(checkStkAmount('').ok).toBe(false);
    expect(checkStkAmount('abc').ok).toBe(false);
  });
});

describe('stk polling', () => {
  const t0 = 1_000_000;
  it('asks every 3 s while pending', () => {
    expect(stkPollDelay('PENDING', t0, t0)).toBe(STK_POLL_MS);
    expect(stkPollDelay(undefined, t0, t0 + 10_000)).toBe(STK_POLL_MS);
    expect(stkPollDelay('PENDING', t0, t0 + STK_WAIT_MS - 1)).toBe(STK_POLL_MS);
  });
  it('stops at a final state', () => {
    for (const s of ['SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'] as const) {
      expect(isFinalStk(s)).toBe(true);
      expect(stkPollDelay(s, t0, t0)).toBe(false);
    }
    expect(isFinalStk('PENDING')).toBe(false);
  });
  it('gives up after about three minutes', () => {
    expect(STK_WAIT_MS).toBe(180_000);
    expect(stkPollDelay('PENDING', t0, t0 + STK_WAIT_MS)).toBe(false);
    expect(stkWaitedTooLong('PENDING', t0, t0 + STK_WAIT_MS)).toBe(true);
    expect(stkWaitedTooLong('PENDING', t0, t0 + 1_000)).toBe(false);
    expect(stkWaitedTooLong('SUCCESS', t0, t0 + STK_WAIT_MS)).toBe(false);
  });
});

describe('describeStk', () => {
  const base = { phone: '+254700000003', amount: 1_500_000, resultDesc: null, mpesaReceipt: null };
  it('pending tells staff to have the tenant check their phone', () => {
    expect(describeStk({ ...base, state: 'PENDING' })).toMatch(/^Check your phone… .*KES 15,000\.00.*\+254700000003/);
  });
  it('success names the receipt', () => {
    expect(describeStk({ ...base, state: 'SUCCESS', mpesaReceipt: 'TEST000001' })).toBe('Paid — M-Pesa receipt TEST000001.');
  });
  it('failure and cancel carry the result description', () => {
    expect(describeStk({ ...base, state: 'FAILED', resultDesc: 'Insufficient balance' })).toMatch(/Insufficient balance/);
    expect(describeStk({ ...base, state: 'CANCELLED', resultDesc: 'Request cancelled by user' })).toMatch(/cancelled.*Request cancelled by user/);
    expect(describeStk({ ...base, state: 'TIMEOUT' })).toMatch(/in time/);
  });
});

describe('idempotency key', () => {
  let n = 0;
  const make = () => `key-${++n}`;
  it('keeps the key while the input is identical, whatever the key order', () => {
    const a = keyFor(null, signatureOf({ tenantId: 't1', amount: 100, phone: '+254700000004' }), make);
    const b = keyFor(a, signatureOf({ phone: '+254700000004', amount: 100, tenantId: 't1' }), make);
    expect(b).toBe(a);
  });
  it('takes a new key once anything changes', () => {
    const a = keyFor(null, signatureOf({ tenantId: 't1', amount: 100 }), make);
    const b = keyFor(a, signatureOf({ tenantId: 't1', amount: 200 }), make);
    expect(b.key).not.toBe(a.key);
  });
  it('starts afresh after an outcome (no previous attempt)', () => {
    const sig = signatureOf({ tenantId: 't1', amount: 100 });
    expect(keyFor(null, sig, make).key).not.toBe(keyFor(null, sig, make).key);
  });
});

describe('stkChannels', () => {
  it('keeps active, connected M-Pesa channels, by name', () => {
    const rows = [
      channel({ id: 'b', name: 'Zeta till', kind: 'MPESA_TILL' }),
      channel({ id: 'a', name: 'Alpha paybill' }),
      channel({ id: 'c', name: 'Not connected', daraja: { configured: false, environment: null, callbackUrls: null, c2bRegisteredAt: null } }),
      channel({ id: 'd', name: 'Inactive', status: 'INACTIVE' }),
      channel({ id: 'e', name: 'Bank', kind: 'BANK_ACCOUNT', daraja: null }),
      channel({ id: 'f', name: 'Old server', daraja: undefined }),
    ];
    expect(stkChannels(rows).map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('knows M-Pesa kinds and their nouns', () => {
    expect(isMpesaKind('MPESA_PAYBILL')).toBe(true);
    expect(isMpesaKind('MPESA_TILL')).toBe(true);
    expect(isMpesaKind('CASH')).toBe(false);
    expect(isMpesaKind(null)).toBe(false);
    expect(mpesaNoun('MPESA_TILL')).toBe('till');
    expect(mpesaNoun('MPESA_PAYBILL')).toBe('paybill');
  });
});

describe('checkDaraja', () => {
  const draft = { environment: 'SANDBOX' as const, consumerKey: ' key-abc ', consumerSecret: 'secret-xyz', passkey: '', storeNumber: '' };
  it('trims and leaves out a blank passkey', () => {
    expect(checkDaraja(draft)).toEqual({ ok: true, body: { environment: 'SANDBOX', consumerKey: 'key-abc', consumerSecret: 'secret-xyz' } });
  });
  it('sends the passkey when given', () => {
    const out = checkDaraja({ ...draft, passkey: 'pass-123' });
    expect(out.ok && out.body.passkey).toBe('pass-123');
  });
  it('requires the environment, key and secret', () => {
    const out = checkDaraja({ environment: '', consumerKey: '', consumerSecret: ' ', passkey: '', storeNumber: '' });
    expect(out.ok).toBe(false);
    expect(!out.ok && Object.keys(out.errors).sort()).toEqual(['consumerKey', 'consumerSecret', 'environment']);
  });
  it('rejects pasted values with spaces inside', () => {
    const out = checkDaraja({ ...draft, consumerKey: 'key abc', passkey: 'pa ss' });
    expect(!out.ok && Object.keys(out.errors).sort()).toEqual(['consumerKey', 'passkey']);
  });
  it('sends a store number for tills only, and checks it', () => {
    const till = checkDaraja({ ...draft, storeNumber: '600100' }, 'MPESA_TILL');
    expect(till.ok && till.body.storeNumber).toBe('600100');
    const paybill = checkDaraja({ ...draft, storeNumber: '600100' }, 'MPESA_PAYBILL');
    expect(paybill.ok && 'storeNumber' in paybill.body).toBe(false);
    const bad = checkDaraja({ ...draft, storeNumber: '12' }, 'MPESA_TILL');
    expect(!bad.ok && bad.errors.storeNumber).toMatch(/5 to 7 digits/);
  });
});

describe('display helpers', () => {
  it('prettyJson pretty-prints objects and JSON strings, and keeps plain text', () => {
    expect(prettyJson({ Body: { ResultCode: 0 } })).toBe('{\n  "Body": {\n    "ResultCode": 0\n  }\n}');
    expect(prettyJson('{"TransID":"TEST000001"}')).toBe('{\n  "TransID": "TEST000001"\n}');
    expect(prettyJson('not json')).toBe('not json');
    expect(prettyJson(null)).toBe('Nothing was stored.');
  });
  it('payerText', () => {
    expect(payerText({ payerName: 'TEST PAYER', payerPhone: '+254700000005' })).toBe('TEST PAYER · +254700000005');
    expect(payerText({ payerName: null, payerPhone: '2547****005' })).toBe('2547****005');
    expect(payerText({ payerName: ' ', payerPhone: null })).toBe('—');
  });
});

describe('mpesaErrorMessage', () => {
  it('words the phase 5 codes plainly', () => {
    expect(mpesaErrorMessage(apiError('DARAJA_NOT_CONFIGURED'))).toMatch(/isn’t connected to M-Pesa/);
    expect(mpesaErrorMessage(apiError('NOT_MPESA_CHANNEL', 422))).toMatch(/Only M-Pesa paybill and till/);
    expect(mpesaErrorMessage(apiError('ALREADY_RESOLVED'))).toMatch(/already dealt with/);
    expect(mpesaErrorMessage(apiError(STEP_UP_REQUIRED, 403))).toMatch(/verification code/);
    expect(mpesaErrorMessage(apiError('IDEMPOTENCY_MISMATCH'))).toMatch(/different details/);
  });
  it('quotes Safaricom’s own words on DARAJA_ERROR', () => {
    expect(mpesaErrorMessage(apiError('DARAJA_ERROR', 502, 'Invalid Access Token'))).toMatch(/“Invalid Access Token”/);
  });
  it('falls through to the payment messages and honours overrides', () => {
    expect(mpesaErrorMessage(apiError('CHANNEL_INACTIVE'))).toMatch(/inactive/);
    expect(mpesaErrorMessage(apiError('ALREADY_RESOLVED'), { ALREADY_RESOLVED: 'custom' })).toBe('custom');
    expect(mpesaErrorMessage(new Error('x'))).toBe('Something went wrong. Try again.');
  });
});
