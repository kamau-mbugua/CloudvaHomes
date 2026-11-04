import { describe, expect, it } from 'vitest';
import { checkRenewal, checkRentChange, leaseEndText, pendingChangeText } from './leaseTerms';

describe('checkRentChange', () => {
  it('turns KES into cents and keeps the month', () => {
    expect(checkRentChange({ newRent: '30,000', effectivePeriod: '2027-01', note: ' Annual review ', notifyTenant: true }))
      .toEqual({ ok: true, body: { newRent: 3_000_000, effectivePeriod: '2027-01', note: 'Annual review', notifyTenant: true } });
  });

  it('needs a rent above zero and a month', () => {
    expect(checkRentChange({ newRent: '0', effectivePeriod: '2027-01', note: '', notifyTenant: false }))
      .toEqual({ ok: false, errors: { newRent: 'Enter a rent above zero.' } });
    expect(checkRentChange({ newRent: '30000', effectivePeriod: '', note: '', notifyTenant: false }))
      .toEqual({ ok: false, errors: { effectivePeriod: 'Choose the first month at the new rent.' } });
  });
});

describe('checkRenewal', () => {
  it('needs a lease end after the move-in day', () => {
    expect(checkRenewal({ leaseEndDate: '2026-03-01', changeRent: false, newRent: '', effectivePeriod: '', notifyTenant: false }, '2026-03-01'))
      .toEqual({ ok: false, errors: { leaseEndDate: 'The lease must end after the move-in date (1 Mar 2026).' } });
  });

  it('sends a rent change only when asked', () => {
    expect(checkRenewal({ leaseEndDate: '2027-12-31', changeRent: false, newRent: '99', effectivePeriod: '2027-01', notifyTenant: false }, '2026-03-01'))
      .toEqual({ ok: true, body: { leaseEndDate: '2027-12-31' } });
    expect(checkRenewal({ leaseEndDate: '2027-12-31', changeRent: true, newRent: '27,500', effectivePeriod: '2027-01', notifyTenant: true }, '2026-03-01'))
      .toEqual({ ok: true, body: { leaseEndDate: '2027-12-31', newRent: 2_750_000, effectivePeriod: '2027-01', notifyTenant: true } });
  });
});

describe('leaseEndText', () => {
  it('says when the lease ends and flags one ending soon', () => {
    expect(leaseEndText(null, '2026-11-04')).toEqual({ text: 'No end date', soon: false });
    expect(leaseEndText('2026-12-20', '2026-11-04')).toEqual({ text: 'Lease ends 20 Dec 2026', soon: true });
    expect(leaseEndText('2027-06-30', '2026-11-04')).toEqual({ text: 'Lease ends 30 Jun 2027', soon: false });
    expect(leaseEndText('2026-10-31', '2026-11-04')).toEqual({ text: 'Lease ended 31 Oct 2026', soon: true });
  });
});

describe('pendingChangeText', () => {
  it('reads like a sentence', () => {
    expect(pendingChangeText({ effectivePeriod: '2027-01', newRent: 3_000_000 })).toBe('Rent changes to KES 30,000.00 from Jan 2027');
  });
});
