import { describe, expect, it } from 'vitest';
import { DEFAULT_STAY_RULES, validateStayRules } from './api';
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
