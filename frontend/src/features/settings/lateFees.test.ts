import { describe, expect, it } from 'vitest';
import { agencyLateFeeNotice, checkLateFees, lateFeeExample, readLateFees } from './lateFees';

describe('readLateFees', () => {
  it('reads the server value or the defaults (off, 5% after 5 days)', () => {
    expect(readLateFees(undefined)).toEqual({ enabled: false, mode: 'PERCENT', amount: 0, percentBps: 500, graceDays: 5, agreementsMissingRecipient: 0 });
    expect(readLateFees({ enabled: true, mode: 'FLAT', amount: 50_000, percentBps: 500, graceDays: 3, agreementsMissingRecipient: 2 }))
      .toEqual({ enabled: true, mode: 'FLAT', amount: 50_000, percentBps: 500, graceDays: 3, agreementsMissingRecipient: 2 });
  });
});

describe('checkLateFees', () => {
  const draft = { enabled: true, mode: 'PERCENT' as const, amount: '', percent: '5', graceDays: '5' };

  it('turns a percentage into basis points', () => {
    expect(checkLateFees(draft)).toEqual({ ok: true, lateFees: { enabled: true, mode: 'PERCENT', amount: 0, percentBps: 500, graceDays: 5 } });
    expect(checkLateFees({ ...draft, percent: '2.5' })).toMatchObject({ ok: true, lateFees: { percentBps: 250 } });
  });

  it('turns a flat amount into cents', () => {
    expect(checkLateFees({ ...draft, mode: 'FLAT', amount: '500' })).toMatchObject({ ok: true, lateFees: { mode: 'FLAT', amount: 50_000 } });
  });

  it('rejects bad values with field messages', () => {
    expect(checkLateFees({ ...draft, percent: '0' })).toEqual({ ok: false, errors: { percent: 'Enter a percentage from 0.01 to 25.' } });
    expect(checkLateFees({ ...draft, percent: '30' })).toEqual({ ok: false, errors: { percent: 'Enter a percentage from 0.01 to 25.' } });
    expect(checkLateFees({ ...draft, graceDays: '61' })).toEqual({ ok: false, errors: { graceDays: 'Enter a whole number of days from 0 to 60.' } });
    expect(checkLateFees({ ...draft, mode: 'FLAT', amount: '0' })).toEqual({ ok: false, errors: { amount: 'Enter a fee above zero.' } });
  });

  it('ignores the fields of the mode not in use, and saves anything while switched off', () => {
    expect(checkLateFees({ ...draft, amount: 'nonsense' })).toMatchObject({ ok: true });
    expect(checkLateFees({ enabled: false, mode: 'FLAT', amount: '', percent: '', graceDays: '' }))
      .toEqual({ ok: true, lateFees: { enabled: false, mode: 'FLAT', amount: 0, percentBps: 500, graceDays: 5 } });
  });
});

describe('lateFeeExample', () => {
  it('shows what a KES 25,000 invoice would get', () => {
    expect(lateFeeExample({ mode: 'PERCENT', amount: 0, percentBps: 500, graceDays: 5 }))
      .toBe('Example: a KES 25,000.00 rent invoice still unpaid 5 days after its due date gets a KES 1,250.00 late fee.');
    expect(lateFeeExample({ mode: 'FLAT', amount: 50_000, percentBps: 500, graceDays: 1 }))
      .toBe('Example: a KES 25,000.00 rent invoice still unpaid 1 day after its due date gets a KES 500.00 late fee.');
  });
});

describe('agencyLateFeeNotice', () => {
  it('says plainly that properties without a decided recipient get no fees', () => {
    expect(agencyLateFeeNotice(2)).toBe('Late fees are only charged on properties whose management agreement says who keeps them. 2 of your current agreements don’t say yet, so their properties get no late fees.');
    expect(agencyLateFeeNotice(1)).toBe('Late fees are only charged on properties whose management agreement says who keeps them. 1 of your current agreements doesn’t say yet, so its properties get no late fees.');
    expect(agencyLateFeeNotice(0)).toBe('Late fees are only charged on properties whose management agreement says who keeps them. All your current agreements say who keeps them.');
  });
});
