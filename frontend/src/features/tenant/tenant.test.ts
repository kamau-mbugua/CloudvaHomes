import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { describeStk, suggestStkAmount } from '../mpesa/rules';
import { tenantMessagingError } from '../tenants/messages';
import { tenantErrorMessage } from './api';
import { accountSearch, checkPay, currentTenancies, homeText, howToPaySteps, ordinal, payNumber, shortcodeLabel } from './rules';

/** Synthetic data only. */

const err = (status: number, code: string, message = 'x') => new ApiError({ status, code, message });

describe('homeText', () => {
  it('names unit and property from objects or strings', () => {
    expect(homeText({ unit: { id: 'u-1', number: 'A1' }, property: { id: 'p-1', code: 'P1', name: 'Sample Court' } })).toBe('A1, Sample Court');
    expect(homeText({ unit: 'B2', property: 'Test Flats' })).toBe('B2, Test Flats');
  });
});

describe('currentTenancies', () => {
  it('drops ended tenancies and puts the newest first', () => {
    const rows = [
      { id: 'a', status: 'ENDED' as const, startDate: '2025-01-01' },
      { id: 'b', status: 'ACTIVE' as const, startDate: '2026-01-01' },
      { id: 'c', status: 'NOTICE' as const, startDate: '2026-05-01' },
    ];
    expect(currentTenancies(rows).map((r) => r.id)).toEqual(['c', 'b']);
  });
});

describe('ordinal', () => {
  it('words the billing day', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '28th']);
  });
});

describe('how to pay', () => {
  it('gives the paybill path with the tenant code as account', () => {
    const way = { kind: 'MPESA_PAYBILL' as const, shortcode: '600000', accountRef: 'T00001' };
    expect(shortcodeLabel(way.kind)).toBe('Paybill number');
    expect(payNumber({ ...way, accountNumber: null })).toBe('600000');
    expect(howToPaySteps(way)).toEqual([
      'M-Pesa → Lipa na M-Pesa → Pay Bill', 'Business number: 600000', 'Account number: T00001', 'Enter the amount and your PIN',
    ]);
  });
  it('gives a till without an account number', () => {
    const way = { kind: 'MPESA_TILL' as const, shortcode: '700000', accountRef: null };
    expect(shortcodeLabel(way.kind)).toBe('Till number');
    expect(howToPaySteps(way)).toEqual(['M-Pesa → Lipa na M-Pesa → Buy Goods and Services', 'Till number: 700000', 'Enter the amount and your PIN']);
  });
  it('gives a bank account with the reference', () => {
    const way = { kind: 'BANK_ACCOUNT' as const, shortcode: null, bankName: 'Test Bank', accountNumber: '0000000001', accountRef: 'T00001' };
    expect(payNumber(way)).toBe('0000000001');
    expect(howToPaySteps(way)).toEqual(['Bank: Test Bank', 'Account number: 0000000001', 'Reference: T00001']);
  });
});

describe('checkPay', () => {
  it('sends whole shillings and a normalised phone', () => {
    expect(checkPay({ amount: '20,500', phone: '0700 000 001' })).toEqual({ ok: true, body: { amount: 2_050_000, phone: '+254700000001' } });
  });
  it('leaves a blank phone out, so the server uses the one on file', () => {
    expect(checkPay({ amount: '100', phone: '  ' })).toEqual({ ok: true, body: { amount: 10_000 } });
  });
  it('refuses cents, zero and a bad phone', () => {
    const out = checkPay({ amount: '100.50', phone: '123' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.amount).toMatch(/whole shillings/);
      expect(out.errors.phone).toMatch(/Kenyan mobile/);
    }
    expect(checkPay({ amount: '0', phone: '' }).ok).toBe(false);
  });
});

describe('suggestStkAmount', () => {
  it('rounds what is owed up to whole shillings, blank when nothing is owed', () => {
    expect(suggestStkAmount(2_050_050)).toBe('20,501');
    expect(suggestStkAmount(2_050_000)).toBe('20,500');
    expect(suggestStkAmount(0)).toBe('');
    expect(suggestStkAmount(-500)).toBe('');
    expect(suggestStkAmount(null)).toBe('');
  });
});

describe('describeStk for the tenant', () => {
  const base = { phone: '+254700000001', amount: 1_000_000, resultDesc: null, mpesaReceipt: null };
  it('speaks to the person holding the phone', () => {
    expect(describeStk({ ...base, state: 'PENDING' }, 'tenant')).toMatch(/^Check your phone\. .*KES 10,000\.00.*Enter your M-Pesa PIN/);
    expect(describeStk({ ...base, state: 'SUCCESS', mpesaReceipt: 'TEST000002' }, 'tenant')).toBe('Paid, thank you — M-Pesa receipt TEST000002.');
    expect(describeStk({ ...base, state: 'TIMEOUT' }, 'tenant')).not.toMatch(/tenant/);
    expect(describeStk({ ...base, state: 'CANCELLED' }, 'tenant')).toMatch(/Nothing was paid/);
  });
  it('keeps the staff wording by default', () => {
    expect(describeStk({ ...base, state: 'TIMEOUT' })).toMatch(/The tenant did not answer/);
  });
});

describe('accountSearch', () => {
  it('keeps ?account= only when there is a choice', () => {
    expect(accountSearch(1, 't-1')).toBe('');
    expect(accountSearch(2, 't-2')).toBe('?account=t-2');
  });
});

describe('tenantErrorMessage', () => {
  it('words the phase 7 codes for a tenant', () => {
    expect(tenantErrorMessage(err(409, 'NO_MPESA'), 'Sample Agency')).toMatch(/^Sample Agency hasn’t set up paying in the app/);
    expect(tenantErrorMessage(err(409, 'NOTHING_DUE'))).toMatch(/don’t owe anything/);
    expect(tenantErrorMessage(err(502, 'DARAJA_ERROR', 'Bad credentials'))).not.toMatch(/Daraja/);
    expect(tenantErrorMessage(err(404, 'NOT_FOUND'), 'Sample Agency')).toMatch(/contact Sample Agency/);
  });
});

describe('tenantMessagingError (staff)', () => {
  it('words NO_CONTACT and NOTHING_DUE', () => {
    expect(tenantMessagingError(err(409, 'NO_CONTACT'))).toMatch(/no phone number/);
    expect(tenantMessagingError(err(409, 'NOTHING_DUE'))).toMatch(/owes nothing/);
  });
});
