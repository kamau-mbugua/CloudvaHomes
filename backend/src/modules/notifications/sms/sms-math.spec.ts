import { describe, expect, it } from 'vitest';
import { bundleAmount, checkBundleUnits, effectiveUnitPrice } from './sms-math.js';

describe('SMS unit prices', () => {
  it('prices a bundle in whole shillings, rounding up', () => {
    expect(bundleAmount(500, 80n)).toBe(40000n); // KES 400
    expect(bundleAmount(333, 80n)).toBe(26700n); // 266.40 → KES 267
  });

  it('uses the organisation price when KodiHub set one', () => {
    expect(effectiveUnitPrice({ unitPrice: null }, { smsUnitPrice: 80n })).toBe(80n);
    expect(effectiveUnitPrice({ unitPrice: 65n }, { smsUnitPrice: 80n })).toBe(65n);
  });

  it('checks the number of units to buy', () => {
    expect(checkBundleUnits(99, 100)).toBe('Buy at least 100 units');
    expect(checkBundleUnits(150.5, 100)).toBe('Enter a whole number of units');
    expect(checkBundleUnits(2_000_000, 100)).toBe('Buy at most 1,000,000 units at a time');
    expect(checkBundleUnits(1000, 100)).toBeNull();
  });
});
