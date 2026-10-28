import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { paymentsErrorMessage } from './api';
import { referenceLabel } from './labels';
import {
  activeChannels, allocationDraftTotal, canReverse, channelDetails, checkAllocations, checkPaymentAmount, checkReceivedAt,
  checkReference, checkSettlement, checkShortcode, checkStatementRange, creditLeft, describeBalance, isReversal, methodText,
  normaliseReference, oldestFirst, planAllocations, splitPaymentError, statementTotals, unwrap, unwrapList,
} from './rules';

/** Synthetic invoices only: ids inv-a…, numbers INV-2026-0000xx. */
const inv = (id: string, dueDate: string, balance: number, issueDate = '2026-01-01') => ({
  id, number: `INV-${id}`, dueDate, issueDate, balance,
});

const apiError = (code: string, status = 409, details: { field: string; message: string }[] = []) =>
  new ApiError({ status, code, message: `server says ${code}`, details });

describe('planAllocations', () => {
  const open = [inv('b', '2026-09-05', 1_000_000), inv('a', '2026-08-05', 500_000), inv('c', '2026-10-05', 2_500_000)];

  it('pays the oldest due first and leaves the rest at zero', () => {
    expect(planAllocations(700_000, open)).toEqual([
      { invoiceId: 'a', amount: 500_000 },
      { invoiceId: 'b', amount: 200_000 },
      { invoiceId: 'c', amount: 0 },
    ]);
  });

  it('pays everything exactly', () => {
    const plan = planAllocations(4_000_000, open);
    expect(plan.map((p) => p.amount)).toEqual([500_000, 1_000_000, 2_500_000]);
    expect(creditLeft(4_000_000, 4_000_000)).toBe(0);
  });

  it('leaves the surplus as credit', () => {
    const plan = planAllocations(4_000_150, open);
    const allocated = plan.reduce((s, p) => s + p.amount, 0);
    expect(allocated).toBe(4_000_000);
    expect(creditLeft(4_000_150, allocated)).toBe(150);
  });

  it('pays the preferred invoice first', () => {
    expect(planAllocations(1_200_000, open, 'c')).toEqual([
      { invoiceId: 'c', amount: 1_200_000 },
      { invoiceId: 'a', amount: 0 },
      { invoiceId: 'b', amount: 0 },
    ]);
  });

  it('breaks due-date ties by issue date, then by the order given', () => {
    const tied = [inv('x', '2026-08-05', 100, '2026-07-20'), inv('y', '2026-08-05', 100, '2026-07-01'), inv('z', '2026-08-05', 100, '2026-07-01')];
    expect(oldestFirst(tied).map((i) => i.id)).toEqual(['y', 'z', 'x']);
  });

  it('handles nothing to pay and nothing paid', () => {
    expect(planAllocations(500, [])).toEqual([]);
    expect(planAllocations(0, open).every((p) => p.amount === 0)).toBe(true);
    expect(planAllocations(-5, open).every((p) => p.amount === 0)).toBe(true);
  });

  it('stays in whole cents', () => {
    const plan = planAllocations(100_001, [inv('a', '2026-08-05', 33_333), inv('b', '2026-08-06', 33_334), inv('c', '2026-08-07', 99_999)]);
    expect(plan.map((p) => p.amount)).toEqual([33_333, 33_334, 33_334]);
    plan.forEach((p) => expect(Number.isInteger(p.amount)).toBe(true));
  });
});

describe('checkAllocations', () => {
  const open = [inv('a', '2026-08-05', 500_000), inv('b', '2026-09-05', 1_000_000)];

  it('returns lines above zero, skipping blanks and zeros', () => {
    expect(checkAllocations({ a: '5,000', b: '' }, open, 600_000)).toEqual({
      ok: true, allocations: [{ invoiceId: 'a', amount: 500_000 }], total: 500_000,
    });
    expect(checkAllocations({ a: '0', b: '2,000.50' }, open, 600_000)).toEqual({
      ok: true, allocations: [{ invoiceId: 'b', amount: 200_050 }], total: 200_050,
    });
  });

  it('refuses more than an invoice’s balance, beside that invoice', () => {
    const out = checkAllocations({ a: '5,000.01' }, open, 1_000_000);
    expect(out).toEqual({ ok: false, errors: { a: 'At most the balance, KES 5,000.00.' } });
  });

  it('refuses bad numbers', () => {
    const out = checkAllocations({ b: '12,34' }, open, 1_000_000);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.b).toBeTruthy();
  });

  it('refuses allocations above the amount received', () => {
    const out = checkAllocations({ a: '5,000', b: '2,000' }, open, 600_000);
    expect(out).toEqual({
      ok: false, errors: {}, general: 'The allocations add up to KES 7,000.00, more than the KES 6,000.00 received.',
    });
  });

  it('allows allocating nothing (all credit)', () => {
    expect(checkAllocations({}, open, 600_000)).toEqual({ ok: true, allocations: [], total: 0 });
  });

  it('totals the inputs that parse', () => {
    expect(allocationDraftTotal({ a: '1,000', b: 'abc', c: '', d: '0.50' })).toBe(100_050);
  });
});

describe('recording a payment', () => {
  it('needs an amount above zero', () => {
    expect(checkPaymentAmount('25,000')).toEqual({ ok: true, minor: 2_500_000 });
    expect(checkPaymentAmount('0')).toEqual({ ok: false, error: 'Enter an amount above zero.' });
    expect(checkPaymentAmount('-5').ok).toBe(false);
  });

  it('needs a received date that is not in the future', () => {
    expect(checkReceivedAt('2026-10-27', '2026-10-27')).toBeNull();
    expect(checkReceivedAt('2026-10-01', '2026-10-27')).toBeNull();
    expect(checkReceivedAt('2026-10-28', '2026-10-27')).toBe('The money can’t have been received in the future.');
    expect(checkReceivedAt('2026-02-30', '2026-10-27')).toBe('Choose the day the money was received.');
  });

  it('upper-cases M-Pesa codes and requires them', () => {
    expect(normaliseReference('MPESA_PAYBILL', ' sjr4 xk2l9p ')).toBe('SJR4XK2L9P');
    expect(normaliseReference('BANK_ACCOUNT', ' slip-0042 ')).toBe('slip-0042');
    expect(checkReference('MPESA_TILL', '')).toBe('Enter the M-Pesa code from the message.');
    expect(checkReference('MPESA_TILL', 'sjr4xk2l9p')).toBeNull();
    expect(checkReference('MPESA_PAYBILL', 'SJR-4XK')).toMatch(/letters and digits/);
    expect(checkReference('CHEQUE', ' ')).toBe('Enter the cheque number.');
    expect(checkReference('CASH', '')).toBeNull();
    expect(checkReference('BANK_ACCOUNT', '')).toBeNull();
  });

  it('names the reference by channel', () => {
    expect(referenceLabel('MPESA_PAYBILL')).toBe('M-Pesa code');
    expect(referenceLabel('CHEQUE')).toBe('Cheque no.');
    expect(referenceLabel('BANK_ACCOUNT')).toBe('Bank slip no.');
    expect(referenceLabel(undefined)).toBe('Reference');
  });

  it('offers only active channels, by name', () => {
    const rows = [
      { name: 'Till', status: 'ACTIVE' as const },
      { name: 'Old bank', status: 'INACTIVE' as const },
      { name: 'Cash office', status: 'ACTIVE' as const },
    ];
    expect(activeChannels(rows).map((c) => c.name)).toEqual(['Cash office', 'Till']);
  });
});

describe('splitPaymentError', () => {
  it('puts allocations[i].amount beside the invoice sent i-th', () => {
    const error = apiError('VALIDATION_FAILED', 422, [
      { field: 'allocations[1].amount', message: 'More than the balance.' },
      { field: 'receivedAt', message: 'In the future.' },
    ]);
    const out = splitPaymentError(error, ['inv-a', 'inv-c'], ['receivedAt', 'allocations'], {}, paymentsErrorMessage);
    expect(out).toEqual({ byInvoice: { 'inv-c': 'More than the balance.' }, byField: { receivedAt: 'In the future.' }, general: null });
  });

  it('keeps a whole-array detail beside the allocation list', () => {
    const error = apiError('VALIDATION_FAILED', 422, [{ field: 'allocations', message: 'Total is more than the amount.' }]);
    expect(splitPaymentError(error, [], ['allocations'], {}, paymentsErrorMessage).byField).toEqual({ allocations: 'Total is more than the amount.' });
  });

  it('puts a duplicate reference beside the reference', () => {
    const out = splitPaymentError(apiError('DUPLICATE_REFERENCE'), [], ['reference'], { DUPLICATE_REFERENCE: 'reference' }, paymentsErrorMessage);
    expect(out.byField.reference).toMatch(/already recorded on this channel/);
    expect(out.general).toBeNull();
  });

  it('describes anything else', () => {
    expect(splitPaymentError(apiError('PERMISSION_DENIED', 403), [], [], {}, paymentsErrorMessage).general)
      .toBe('Your role does not allow this change.');
  });
});

describe('error messages', () => {
  it('words every new code in plain English', () => {
    for (const code of ['DUPLICATE_REFERENCE', 'CHANNEL_INACTIVE', 'ALREADY_REVERSED', 'IS_REVERSAL', 'TENANCY_ACTIVE', 'NAME_TAKEN', 'IN_USE']) {
      const message = paymentsErrorMessage(apiError(code));
      expect(message).not.toContain('server says');
      expect(message.length).toBeGreaterThan(10);
    }
    expect(paymentsErrorMessage(apiError('IN_USE'))).toMatch(/inactive/);
  });

  it('names the earlier receipt on a duplicate reference', () => {
    const error = new ApiError({ status: 409, code: 'DUPLICATE_REFERENCE', message: 'Reference already used by RCT-2026-000012', details: [] });
    expect(paymentsErrorMessage(error)).toBe('This reference is already recorded on this channel, as RCT-2026-000012. The payment is probably already in.');
  });

  it('takes overrides, and falls back to billing then the server', () => {
    expect(paymentsErrorMessage(apiError('IN_USE'), { IN_USE: 'Custom.' })).toBe('Custom.');
    expect(paymentsErrorMessage(apiError('INVOICE_VOID'))).toMatch(/voided/);
    expect(paymentsErrorMessage(apiError('SOMETHING_NEW'))).toBe('server says SOMETHING_NEW');
  });
});

describe('reversal', () => {
  const original = { amount: 2_500_000, reversesId: null, reversedBy: null };

  it('only reverses an original that is not reversed yet', () => {
    expect(canReverse(original)).toBe(true);
    expect(canReverse({ ...original, reversedBy: { id: 'p2', number: 'RCT-2026-000002' } })).toBe(false);
    expect(canReverse({ amount: -2_500_000, reversesId: 'p1', reversedBy: null })).toBe(false);
  });

  it('knows a reversal by its link or its sign', () => {
    expect(isReversal({ amount: -100, reversesId: null })).toBe(true);
    expect(isReversal({ amount: 100, reversesId: 'p1' })).toBe(true);
    expect(isReversal({ amount: 100, reversesId: null })).toBe(false);
  });

  it('describes the method', () => {
    expect(methodText({ method: 'MPESA_PAYBILL', channel: { id: 'c1', name: 'Main paybill', kind: 'MPESA_PAYBILL' } })).toBe('M-Pesa paybill · Main paybill');
    expect(methodText({ method: 'DEPOSIT', channel: null })).toBe('From deposit');
  });
});

describe('statement', () => {
  it('adds up debits and credits, treating blanks as zero', () => {
    const entries = [
      { debit: 2_500_000, credit: null },
      { debit: null, credit: 2_000_000 },
      { debit: 0, credit: 300_000 },
      { debit: 2_000_000, credit: null },
    ];
    expect(statementTotals(entries)).toEqual({ debit: 4_500_000, credit: 2_300_000 });
  });

  it('reconciles: closing = opening + debits − credits', () => {
    const opening = 120_000;
    const totals = statementTotals([{ debit: 2_500_000, credit: null }, { debit: null, credit: 2_700_000 }]);
    expect(opening + totals.debit - totals.credit).toBe(-80_000);
    expect(describeBalance(-80_000)).toBe('KES 800.00 in credit');
    expect(describeBalance(120_000)).toBe('KES 1,200.00 owed');
    expect(describeBalance(0)).toBe('Nothing owed');
  });

  it('checks the range', () => {
    expect(checkStatementRange('', '')).toBeNull();
    expect(checkStatementRange('2026-01-01', '')).toBeNull();
    expect(checkStatementRange('2026-10-01', '2026-09-30')).toBe('The start date must be on or before 30 Sep 2026.');
    expect(checkStatementRange('2026-13-01', '')).toBe('Choose a start date.');
  });
});

describe('checkSettlement', () => {
  const held = 5_000_000;
  const draft = (applyAmount: string, refundAmount: string, refundReference = '') => ({ applyAmount, refundAmount, refundReference });

  it('applies, refunds, or both, within what is held', () => {
    expect(checkSettlement(draft('20,000', '30,000', 'QWE123RTY'), held)).toEqual({
      ok: true, applyAmount: 2_000_000, refundAmount: 3_000_000, refundReference: 'QWE123RTY',
    });
    expect(checkSettlement(draft('20,000', ''), held)).toEqual({ ok: true, applyAmount: 2_000_000, refundAmount: 0, refundReference: undefined });
  });

  it('refuses more than held, alone or together', () => {
    const one = checkSettlement(draft('50,000.01', ''), held);
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.errors.applyAmount).toBe('At most the KES 50,000.00 held.');
    const both = checkSettlement(draft('30,000', '30,000', 'REF1'), held);
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.general).toMatch(/more than the KES 50,000.00 held/);
  });

  it('needs a refund reference and something to do', () => {
    const noRef = checkSettlement(draft('', '1,000'), held);
    expect(noRef.ok).toBe(false);
    if (!noRef.ok) expect(noRef.errors.refundReference).toBeTruthy();
    const nothing = checkSettlement(draft('', ''), held);
    expect(nothing).toEqual({ ok: false, errors: {}, general: 'Enter an amount to apply, to refund, or both.' });
  });
});

describe('channels', () => {
  const base = { shortcode: null, bankName: null, accountNumber: null, accountName: null };

  it('describes a channel by kind', () => {
    expect(channelDetails({ ...base, kind: 'MPESA_PAYBILL', shortcode: '522522' })).toBe('Paybill 522522');
    expect(channelDetails({ ...base, kind: 'MPESA_TILL', shortcode: '81234' })).toBe('Till 81234');
    expect(channelDetails({ ...base, kind: 'BANK_ACCOUNT', bankName: 'Test Bank', accountNumber: '0000000001' })).toBe('Test Bank · 0000000001');
    expect(channelDetails({ ...base, kind: 'CASH' })).toBe('');
  });

  it('checks shortcodes', () => {
    expect(checkShortcode('522522')).toBeNull();
    expect(checkShortcode('1234')).toBe('Enter 5 to 7 digits.');
    expect(checkShortcode('12a456')).toBe('Enter 5 to 7 digits.');
  });
});

describe('envelopes', () => {
  it('unwraps with or without data', () => {
    expect(unwrap({ data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrap({ a: 1 })).toEqual({ a: 1 });
    expect(unwrapList({ data: [1, 2] })).toEqual([1, 2]);
    expect(unwrapList([3])).toEqual([3]);
    expect(unwrapList({ data: { items: [] } })).toEqual([]);
    expect(unwrapList(undefined)).toEqual([]);
  });
});
