import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { agencyErrorMessage, ownerErrorMessage, payoutErrorMessage } from './api';
import {
  agreementState, agreementToDraft, bpsToPercent, checkAdjustment, checkAgreement, checkEndDate, checkPaid, checkPayout,
  describeNet, describePayable, describeRate, groupCollections, newAgreementDraft, ordinal, parsePercent, personLabel,
  rangeText, remittanceActions, statementFilename, withRunningBalance,
  bulkFilename, bulkSelectable, canSendByMpesa, checkResolve, describePayout, isWholeShillings, payoutInFlight, payoutPollDelay,
  PAYOUT_POLL_MS, PAYOUT_WAIT_MS,
} from './rules';
import type { AgreementDraft, PayoutDraft } from './rules';
import type { Agreement, LedgerEntry, RemittancePayout } from './types';

/** Synthetic data only: landlords L0001…, phones +2547000000xx. */

const apiError = (code: string, status = 409) => new ApiError({ status, code, message: `server says ${code}` });

const agreement = (over: Partial<Agreement> = {}): Agreement => ({
  id: 'ag-1', landlord: { id: 'll-1', code: 'L0001', name: 'Test Landlord One' }, propertyIds: [],
  commissionBasis: 'PERCENT_OF_COLLECTED', commissionBps: 1000, fixedAmount: null, commissionableLines: ['RENT'],
  collection: 'AGENCY_COLLECTS', remittanceDay: 5, deductExpenses: true, holdDeposits: true,
  startDate: '2026-01-01', endDate: null, active: true, createdAt: '2026-01-01T00:00:00Z', ...over,
});

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'e', bucket: 'PAYABLE', kind: 'COLLECTION', amount: 0, occurredAt: '2026-10-01', memo: null, property: null, unit: null,
  tenant: null, payment: null, invoice: null, expense: null, remittance: null, createdAt: '2026-10-01T00:00:00Z', ...over,
});

describe('parsePercent / bpsToPercent', () => {
  it.each([['10', 1000], ['7.5', 750], ['12.25', 1225], ['100', 10_000], ['0.5', 50], ['.5', 50], ['10%', 1000]])('reads %s as %i bps', (input, bps) => {
    expect(parsePercent(input)).toEqual({ ok: true, bps });
  });
  it.each(['', '0', '100.01', '101', 'ten', '-5', '7.125'])('rejects %s', (input) => {
    expect(parsePercent(input).ok).toBe(false);
  });
  it('says why three decimals fail', () => {
    expect(parsePercent('7.125')).toEqual({ ok: false, error: expect.stringMatching(/two decimal/) });
  });
  it.each([[1000, '10'], [750, '7.5'], [1225, '12.25'], [5, '0.05'], [10_000, '100']])('writes %i bps as %s', (bps, text) => {
    expect(bpsToPercent(bps)).toBe(text);
  });
});

describe('describeRate / ordinal', () => {
  it('reads each basis', () => {
    expect(describeRate(agreement())).toBe('10% of collected');
    expect(describeRate(agreement({ commissionBasis: 'PERCENT_OF_INVOICED', commissionBps: 850 }))).toBe('8.5% of invoiced');
    expect(describeRate(agreement({ commissionBasis: 'FIXED_MONTHLY', commissionBps: null, fixedAmount: 500_000 }))).toBe('KES 5,000.00 a month');
  });
  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [28, '28th']])('%i → %s', (n, text) => {
    expect(ordinal(n)).toBe(text);
  });
});

describe('agreementState', () => {
  it('is upcoming before the start, ended after the end, else active', () => {
    expect(agreementState(agreement({ startDate: '2026-11-01', active: false }), '2026-10-27')).toBe('UPCOMING');
    expect(agreementState(agreement({ endDate: '2026-09-30', active: false }), '2026-10-27')).toBe('ENDED');
    expect(agreementState(agreement({ endDate: '2026-10-27' }), '2026-10-27')).toBe('ACTIVE');
    expect(agreementState(agreement(), '2026-10-27')).toBe('ACTIVE');
  });
});

describe('checkAgreement', () => {
  const draft = (over: Partial<AgreementDraft> = {}): AgreementDraft => ({ ...newAgreementDraft('2026-10-27', 'll-1'), ...over });

  it('defaults to 10% of rent collected from the first of the month', () => {
    const out = checkAgreement(draft());
    expect(out).toEqual({
      ok: true,
      body: {
        landlordId: 'll-1', propertyIds: [], commissionBasis: 'PERCENT_OF_COLLECTED', commissionBps: 1000, fixedAmount: null,
        commissionableLines: ['RENT'], collection: 'AGENCY_COLLECTS', remittanceDay: 5, deductExpenses: true, holdDeposits: true,
        startDate: '2026-10-01', endDate: null,
      },
    });
  });

  it('sends a fixed fee in cents and no rate', () => {
    const out = checkAgreement(draft({ commissionBasis: 'FIXED_MONTHLY', fixedAmount: '5,000' }));
    expect(out.ok && out.body).toMatchObject({ commissionBps: null, fixedAmount: 500_000 });
  });

  it('sends only the ticked properties when narrowed', () => {
    const out = checkAgreement(draft({ scope: 'SOME', propertyIds: ['p-1'] }));
    expect(out.ok && out.body.propertyIds).toEqual(['p-1']);
    expect(checkAgreement(draft({ scope: 'ALL', propertyIds: ['p-1'] })).ok && checkAgreement(draft({ scope: 'ALL', propertyIds: ['p-1'] }))).toMatchObject({ body: { propertyIds: [] } });
  });

  it('reports every problem at once', () => {
    const out = checkAgreement(draft({
      landlordId: '', scope: 'SOME', rate: '0', commissionableLines: [], remittanceDay: '29', startDate: '2026-10-10', endDate: '2026-10-01',
    }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(Object.keys(out.errors).sort()).toEqual(['commissionableLines', 'endDate', 'landlordId', 'propertyIds', 'rate', 'remittanceDay']);
    }
  });

  it('round-trips an existing agreement', () => {
    const a = agreement({ commissionBps: 750, endDate: '2026-12-31', propertyIds: ['p-2'] });
    const out = checkAgreement(agreementToDraft(a));
    expect(out.ok && out.body).toMatchObject({ commissionBps: 750, endDate: '2026-12-31', propertyIds: ['p-2'] });
    expect(agreementToDraft(agreement({ commissionBasis: 'FIXED_MONTHLY', fixedAmount: 1_250_050 })).fixedAmount).toBe('12,500.50');
  });

  it('checks an end date against the start', () => {
    expect(checkEndDate('2025-12-31', agreement())).toMatch(/before the agreement started/);
    expect(checkEndDate('2026-01-01', agreement())).toBeNull();
    expect(checkEndDate('', agreement())).toMatch(/last day/);
  });
});

describe('describePayable', () => {
  it('reads a negative payable balance as the landlord owing the agency', () => {
    expect(describePayable(-50_000)).toBe('Landlord owes the agency');
    expect(describePayable(50_000)).toBe('Agency owes the landlord');
    expect(describePayable(0)).toBe('Nothing owed either way');
  });
  it('speaks to the landlord in the owner portal', () => {
    expect(describePayable(-1, 'owner')).toBe('You owe the agency');
    expect(describePayable(1, 'owner')).toBe('Due to you from the agency');
  });
});

describe('withRunningBalance', () => {
  const rows = [entry({ id: 'c', amount: -1_000 }), entry({ id: 'b', amount: -500 }), entry({ id: 'a', amount: 10_000 })];

  it('keeps the API’s own balance', () => {
    const out = withRunningBalance([entry({ amount: 5, balance: 42 })], null);
    expect(out[0].running).toBe(42);
  });
  it('works back from the closing balance, newest first', () => {
    expect(withRunningBalance(rows, 8_500).map((r) => r.running)).toEqual([8_500, 9_500, 10_000]);
  });
  it('leaves balances unknown without one', () => {
    expect(withRunningBalance(rows, null).map((r) => r.running)).toEqual([null, null, null]);
  });
  it('continues from a row that has a balance', () => {
    const mixed = [entry({ amount: -100, balance: 900 }), entry({ amount: 1_000 })];
    expect(withRunningBalance(mixed, null).map((r) => r.running)).toEqual([900, 1_000]);
  });
});

describe('checkAdjustment', () => {
  it('signs the amount by its effect', () => {
    expect(checkAdjustment({ bucket: 'PAYABLE', direction: 'credit', amount: '1,000', memo: 'Opening balance' }))
      .toEqual({ ok: true, body: { bucket: 'PAYABLE', amount: 100_000, memo: 'Opening balance' } });
    expect(checkAdjustment({ bucket: 'DEPOSIT_HELD', direction: 'debit', amount: '250.50', memo: 'Correction of entry' }))
      .toEqual({ ok: true, body: { bucket: 'DEPOSIT_HELD', amount: -25_050, memo: 'Correction of entry' } });
  });
  it('needs an amount and a reason', () => {
    const out = checkAdjustment({ bucket: 'PAYABLE', direction: 'credit', amount: '0', memo: 'x' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(Object.keys(out.errors).sort()).toEqual(['amount', 'memo']);
  });
});

describe('checkPayout', () => {
  const blank: PayoutDraft = { method: 'BANK', bankName: '', branch: '', accountName: '', accountNumber: '', phone: '', payeeName: '' };

  it('sends only the bank fields, digits only', () => {
    expect(checkPayout({ ...blank, bankName: 'Test Bank', accountName: 'Test Landlord One', accountNumber: '0100 0000 0042', phone: '0700000001' }))
      .toEqual({ ok: true, body: { method: 'BANK', bankName: 'Test Bank', accountName: 'Test Landlord One', accountNumber: '010000000042' } });
  });
  it('normalises an M-Pesa phone', () => {
    expect(checkPayout({ ...blank, method: 'MPESA', phone: '0700 000 042' })).toEqual({ ok: true, body: { method: 'MPESA', phone: '+254700000042' } });
  });
  it('needs a payee for cheques', () => {
    expect(checkPayout({ ...blank, method: 'CHEQUE' })).toEqual({ ok: false, errors: { payeeName: expect.any(String) } });
  });
  it('flags each missing bank field and a bad number', () => {
    const out = checkPayout({ ...blank, accountNumber: '12ab' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(Object.keys(out.errors).sort()).toEqual(['accountName', 'accountNumber', 'bankName']);
    expect(checkPayout({ ...blank, method: 'MPESA', phone: '12345' })).toEqual({ ok: false, errors: { phone: expect.stringMatching(/Kenyan mobile/) } });
  });
});

describe('remittances', () => {
  const me = { id: 'u-2', permissions: ['remittances:approve', 'remittances:pay', 'remittances:create'] };

  it('hides Approve from the drafter and says why', () => {
    const out = remittanceActions({ status: 'DRAFT', draftedBy: { id: 'u-2' } }, me);
    expect(out.approve).toBe(false);
    expect(out.approveBlocked).toMatch(/You drafted this remittance/);
  });
  it('lets a second person approve, and anyone approve a nightly-job draft', () => {
    expect(remittanceActions({ status: 'DRAFT', draftedBy: { id: 'u-1' } }, me)).toMatchObject({ approve: true, approveBlocked: null, pay: false, cancel: true });
    expect(remittanceActions({ status: 'DRAFT', draftedBy: null }, me)).toMatchObject({ approve: true, approveBlocked: null });
  });
  it('pays only approved ones, with the permission', () => {
    expect(remittanceActions({ status: 'APPROVED', draftedBy: null }, me)).toMatchObject({ approve: false, pay: true, cancel: true });
    expect(remittanceActions({ status: 'APPROVED', draftedBy: null }, { id: 'u-3', permissions: [] })).toMatchObject({ pay: false, cancel: false });
    expect(remittanceActions({ status: 'PAID', draftedBy: null }, me)).toEqual({ approve: false, approveBlocked: null, pay: false, cancel: false });
  });
  it('does not explain a hidden Approve to someone without the permission', () => {
    expect(remittanceActions({ status: 'DRAFT', draftedBy: { id: 'u-3' } }, { id: 'u-3', permissions: [] }).approveBlocked).toBeNull();
  });
  it('checks the payment record', () => {
    expect(checkPaid({ method: 'MPESA', reference: ' tst 00 0042 ', paidAt: '2026-10-27' }, '2026-10-27'))
      .toEqual({ ok: true, body: { method: 'MPESA', reference: 'TST000042', paidAt: '2026-10-27' } });
    expect(checkPaid({ method: 'BANK', reference: '', paidAt: '2026-10-28' }, '2026-10-27'))
      .toEqual({ ok: false, errors: { reference: expect.stringMatching(/transfer reference/), paidAt: expect.stringMatching(/future/) } });
  });
  it('words the net and the people', () => {
    expect(describeNet({ net: 4_500_000, direction: 'TO_LANDLORD' })).toBe('KES 45,000.00 to the landlord');
    expect(describeNet({ net: -200_000, direction: 'FROM_LANDLORD' })).toBe('KES 2,000.00 from the landlord');
    expect(describeNet({ net: 100, direction: 'TO_LANDLORD' }, 'owner')).toBe('KES 1.00 to you');
    expect(personLabel({ id: 'u', firstName: 'Test', lastName: 'User' })).toBe('Test User');
    expect(personLabel({ id: 'u', name: 'Named' })).toBe('Named');
    expect(personLabel(null)).toBe('Someone');
  });
});

describe('statements', () => {
  it('groups payable collections by property with totals, ignoring other entries', () => {
    const p1 = { id: 'p-1', code: 'P1', name: 'Test Court' };
    const p2 = { id: 'p-2', code: 'P2', name: 'Sample Flats' };
    const groups = groupCollections([
      entry({ id: '1', property: p1, amount: 2_000_000 }),
      entry({ id: '2', property: p2, amount: 1_500_000 }),
      entry({ id: '3', property: p1, amount: -500_000 }),
      entry({ id: '4', property: p1, kind: 'COMMISSION', amount: -200_000 }),
      entry({ id: '5', property: p1, bucket: 'DEPOSIT_HELD', kind: 'DEPOSIT', amount: 3_000_000 }),
    ]);
    expect(groups.map((g) => [g.key, g.total, g.rows.length])).toEqual([['p-1', 1_500_000, 2], ['p-2', 1_500_000, 1]]);
  });
  it('names the PDF and the range', () => {
    expect(statementFilename('L0001', '2026-01', '2026-03')).toBe('Owner-statement-L0001-2026-01-to-2026-03.pdf');
    expect(statementFilename(undefined, '2026-10', '2026-10')).toBe('Owner-statement-landlord-2026-10.pdf');
    expect(rangeText('2026-10', '2026-10')).toBe('October 2026');
    expect(rangeText('2026-01', '2026-03')).toBe('Jan 2026 – Mar 2026');
  });
});

describe('agencyErrorMessage', () => {
  it.each([
    ['AGREEMENT_OVERLAP', /already has an agreement covering/],
    ['AGREEMENT_IN_USE', /end it and add a new agreement/],
    ['REMITTANCE_EXISTS', /already has a remittance for that month/],
    ['REMITTANCE_STATE', /moved on since you opened it/],
    ['SAME_PERSON', /someone else has to approve/],
    ['NO_CONTACT', /no phone number or e-mail/],
    ['AGENCY_ONLY', /only used by agencies/],
  ])('explains %s', (code, pattern) => {
    expect(agencyErrorMessage(apiError(code, code === 'AGENCY_ONLY' ? 403 : 409))).toMatch(pattern);
  });
  it('falls back to the shared messages, then the server’s words', () => {
    expect(agencyErrorMessage(apiError('PERMISSION_DENIED', 403))).toMatch(/Your role/);
    expect(agencyErrorMessage(apiError('SOMETHING_NEW'))).toBe('server says SOMETHING_NEW');
  });
  it('reads a 404 in the owner portal as "not yours"', () => {
    expect(ownerErrorMessage(apiError('NOT_FOUND', 404))).toMatch(/couldn’t find this landlord account/);
  });
});

// ---------------------------------------------------------------- phase 10: payouts

describe('canSendByMpesa', () => {
  const pay = ['remittances:pay'];
  const approved = { status: 'APPROVED' as const, direction: 'TO_LANDLORD' as const };
  it('offers it for an approved payout to a landlord paid by M-Pesa', () => {
    expect(canSendByMpesa(approved, 'MPESA', pay)).toBe(true);
  });
  it('not by bank, not unknown, not from the landlord, not unapproved, not without the permission', () => {
    expect(canSendByMpesa(approved, 'BANK', pay)).toBe(false);
    expect(canSendByMpesa(approved, null, pay)).toBe(false);
    expect(canSendByMpesa({ ...approved, direction: 'FROM_LANDLORD' }, 'MPESA', pay)).toBe(false);
    expect(canSendByMpesa({ ...approved, status: 'SENDING' }, 'MPESA', pay)).toBe(false);
    expect(canSendByMpesa(approved, 'MPESA', ['remittances:view'])).toBe(false);
  });
});

describe('isWholeShillings', () => {
  it.each([[150_000, true], [0, true], [150_050, false], [1.5, false]])('%s → %s', (minor, whole) => {
    expect(isWholeShillings(minor)).toBe(whole);
  });
});

const payout = (over: Partial<RemittancePayout> = {}): RemittancePayout => ({
  id: 'po-1', state: 'PENDING', amount: 150_000, phone: '+254 7•• ••• 001', receipt: null, resultDesc: null,
  createdAt: '2026-10-28T09:00:00Z', ...over,
});

describe('payout polling', () => {
  it('is in flight while SENDING or PENDING', () => {
    expect(payoutInFlight({ status: 'SENDING', payout: null })).toBe(true);
    expect(payoutInFlight({ status: 'APPROVED', payout: payout() })).toBe(true);
    expect(payoutInFlight({ status: 'PAID', payout: payout({ state: 'SUCCESS' }) })).toBe(false);
    expect(payoutInFlight({ status: 'SENDING', payout: payout({ state: 'UNCERTAIN' }) })).toBe(true);
  });
  it('asks every 3 s for about three minutes, then stops', () => {
    const r = { status: 'SENDING' as const, payout: payout() };
    expect(payoutPollDelay(r, 0, 1_000)).toBe(PAYOUT_POLL_MS);
    expect(payoutPollDelay(r, 0, PAYOUT_WAIT_MS)).toBe(false);
    expect(payoutPollDelay({ status: 'PAID', payout: payout({ state: 'SUCCESS' }) }, 0, 1_000)).toBe(false);
    expect(payoutPollDelay(undefined, 0, 1_000)).toBe(false);
  });
});

describe('describePayout', () => {
  it('words each state', () => {
    expect(describePayout(payout())).toBe('Sending KES 1,500.00 to +254 7•• ••• 001 — waiting for M-Pesa to confirm.');
    expect(describePayout(payout({ state: 'SUCCESS', receipt: 'TEST000001' }))).toBe('Sent KES 1,500.00 to +254 7•• ••• 001. M-Pesa receipt TEST000001.');
    expect(describePayout(payout({ state: 'FAILED', resultDesc: 'Insufficient funds ' }))).toMatch(/“Insufficient funds”.*back to approved/);
    expect(describePayout(payout({ state: 'UNCERTAIN' }))).toBe('M-Pesa didn’t confirm. Check the B2C account’s M-Pesa statement before doing anything.');
  });
});

describe('checkResolve', () => {
  it('needs an outcome and a note; a receipt only when paid', () => {
    const empty = checkResolve({ outcome: '', receipt: '', note: '' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(Object.keys(empty.errors).sort()).toEqual(['note', 'outcome']);
    const paid = checkResolve({ outcome: 'PAID', receipt: '', note: 'Seen on the statement' });
    expect(paid.ok).toBe(false);
    if (!paid.ok) expect(paid.errors.receipt).toMatch(/receipt/);
  });
  it('tidies the receipt and drops it when not paid', () => {
    expect(checkResolve({ outcome: 'PAID', receipt: ' test 000001 ', note: ' Seen on the statement ' }))
      .toEqual({ ok: true, body: { outcome: 'PAID', receipt: 'TEST000001', note: 'Seen on the statement' } });
    expect(checkResolve({ outcome: 'NOT_PAID', receipt: 'TEST000001', note: 'Not on the statement' }))
      .toEqual({ ok: true, body: { outcome: 'NOT_PAID', note: 'Not on the statement' } });
  });
  it('refuses a receipt that isn’t one', () => {
    const r = checkResolve({ outcome: 'PAID', receipt: 'ABC', note: 'checked' });
    expect(r.ok).toBe(false);
  });
});

describe('bulk bank payouts', () => {
  const approved = { status: 'APPROVED' as const, direction: 'TO_LANDLORD' as const };
  it('offers approved bank payouts, and any approved payout when the method isn’t known', () => {
    expect(bulkSelectable({ ...approved, payoutTo: { method: 'BANK', masked: 'Test Bank · •••• 0001' } })).toBe(true);
    expect(bulkSelectable({ ...approved })).toBe(true);
    expect(bulkSelectable({ ...approved, payoutTo: { method: 'MPESA', masked: '•••• 0001' } })).toBe(false);
    expect(bulkSelectable({ ...approved, payoutTo: null })).toBe(false);
    expect(bulkSelectable({ status: 'DRAFT', direction: 'TO_LANDLORD' })).toBe(false);
    expect(bulkSelectable({ ...approved, direction: 'FROM_LANDLORD' })).toBe(false);
  });
  it('names the file as the server says, else by today', () => {
    expect(bulkFilename('from-server.csv', '2026-10-28')).toBe('from-server.csv');
    expect(bulkFilename(null, '2026-10-28')).toBe('bulk-payments-2026-10-28.csv');
  });
});

describe('payout errors', () => {
  it('shows the server’s words for SAME_PERSON (the approver can’t send)', () => {
    const e = new ApiError({ status: 409, code: 'SAME_PERSON', message: 'You approved this remittance, so someone else has to send it.' });
    expect(payoutErrorMessage(e)).toBe('You approved this remittance, so someone else has to send it.');
  });
  it('words the payout codes', () => {
    expect(agencyErrorMessage(apiError('NO_PAYOUT_ACCOUNT'))).toMatch(/Settings → Payouts/);
    expect(agencyErrorMessage(apiError('PAYOUT_NOT_MPESA'))).toMatch(/isn’t paid by M-Pesa/);
    expect(agencyErrorMessage(apiError('WHOLE_SHILLINGS', 422))).toMatch(/whole shillings/);
    expect(payoutErrorMessage(apiError('NO_PAYOUT_ACCOUNT'))).toMatch(/Settings → Payouts/);
  });
});
