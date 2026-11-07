import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAY_RULES,
  fromApiRules,
  guestPaymentWarning,
  toApiRules,
  validateStayRules,
} from './api';
import { fromMinor, toMinorString } from './money';

describe('stays money helpers', () => {
  it('converts whole-shilling KES strings to minor-unit strings and rejects cents', () => {
    expect(toMinorString('1500')).toBe('150000');
    expect(toMinorString('1,500')).toBe('150000');
    expect(toMinorString('0')).toBe('0');
    expect(toMinorString('1500.50')).toBeNull();
    expect(toMinorString('-100')).toBeNull();
    expect(toMinorString('abc')).toBeNull();
  });

  it('converts minor-unit strings back to whole-shilling strings', () => {
    expect(fromMinor('150000')).toBe('1500');
    expect(fromMinor('0')).toBe('0');
  });
});

describe('validateStayRules', () => {
  it('accepts default rules and enforces deposit percent 1..100 and custom days >= 0', () => {
    expect(validateStayRules(DEFAULT_STAY_RULES)).toBeNull();
    expect(
      validateStayRules({
        ...DEFAULT_STAY_RULES,
        payment: { kind: 'DEPOSIT', depositPercent: 0, balanceDueDaysBefore: 2 },
      }),
    ).toMatch(/1.*100/);
    expect(
      validateStayRules({
        ...DEFAULT_STAY_RULES,
        payment: { kind: 'DEPOSIT', depositPercent: 101, balanceDueDaysBefore: 2 },
      }),
    ).toMatch(/1.*100/);
    expect(
      validateStayRules({
        ...DEFAULT_STAY_RULES,
        cancellation: { kind: 'CUSTOM', fullRefundDays: -1, partialRefundDays: 0, partialPercent: 50 },
      }),
    ).toBeTruthy();
  });
});

describe('guestPaymentWarning', () => {
  const none = { paybill: false, mpesaPrompt: false };
  it('warns when guests have no way to pay and money is due upfront', () => {
    expect(guestPaymentWarning(none, DEFAULT_STAY_RULES)).toBe(
      "Guests can't pay you yet. Add an M-Pesa paybill or till so guests can pay when they book. Until then, bookings that need payment upfront are held for 2 hours and then released.",
    );
    expect(
      guestPaymentWarning(none, {
        ...DEFAULT_STAY_RULES,
        payment: { kind: 'DEPOSIT', depositPercent: 30, balanceDueDaysBefore: 2 },
      }),
    ).not.toBeNull();
  });
  it('stays quiet when guests can pay, or pay on arrival', () => {
    expect(guestPaymentWarning({ paybill: true, mpesaPrompt: false }, DEFAULT_STAY_RULES)).toBeNull();
    expect(guestPaymentWarning({ paybill: true, mpesaPrompt: true }, DEFAULT_STAY_RULES)).toBeNull();
    expect(
      guestPaymentWarning(none, { ...DEFAULT_STAY_RULES, payment: { kind: 'ON_ARRIVAL' } }),
    ).toBeNull();
    expect(guestPaymentWarning(undefined, DEFAULT_STAY_RULES)).toBeNull();
  });
});

describe('rules sent to and read from the API', () => {
  it('turns the form rules into the API shape', () => {
    expect(toApiRules(DEFAULT_STAY_RULES)).toEqual({
      bookingMode: 'INSTANT',
      payWhen: 'FULL',
      depositPercent: null,
      depositFixed: null,
      balanceDue: 'ON_ARRIVAL',
      balanceDaysBefore: 0,
      cancellation: 'MODERATE',
      customFullRefundDays: null,
      customLatePercent: null,
    });
    expect(
      toApiRules({
        bookingMode: 'REQUEST',
        payment: { kind: 'DEPOSIT', depositPercent: 30, balanceDueDaysBefore: 3 },
        cancellation: { kind: 'CUSTOM', fullRefundDays: 10, partialRefundDays: 0, partialPercent: 25 },
      }),
    ).toMatchObject({
      bookingMode: 'REQUEST',
      payWhen: 'DEPOSIT',
      depositPercent: 30,
      balanceDue: 'BEFORE_CHECKIN',
      balanceDaysBefore: 3,
      cancellation: 'CUSTOM',
      customFullRefundDays: 10,
      customLatePercent: 25,
    });
    expect(
      toApiRules({ ...DEFAULT_STAY_RULES, payment: { kind: 'DEPOSIT', depositPercent: 50, balanceDueDaysBefore: 0 } }),
    ).toMatchObject({ payWhen: 'DEPOSIT', balanceDue: 'ON_ARRIVAL', balanceDaysBefore: 0 });
  });

  it('reads the API shape back into the form, and round-trips', () => {
    expect(fromApiRules({ payWhen: 'FULL', bookingMode: 'INSTANT', cancellation: 'MODERATE' })).toEqual(
      DEFAULT_STAY_RULES,
    );
    expect(fromApiRules(null)).toEqual(DEFAULT_STAY_RULES);
    const custom = {
      bookingMode: 'REQUEST' as const,
      payment: { kind: 'DEPOSIT' as const, depositPercent: 30, balanceDueDaysBefore: 3 },
      cancellation: { kind: 'CUSTOM' as const, fullRefundDays: 10, partialRefundDays: 0, partialPercent: 25 },
    };
    expect(fromApiRules(toApiRules(custom))).toEqual(custom);
    expect(fromApiRules(toApiRules({ ...DEFAULT_STAY_RULES, payment: { kind: 'ON_ARRIVAL' } }))).toEqual({
      ...DEFAULT_STAY_RULES,
      payment: { kind: 'ON_ARRIVAL' },
    });
  });
});
