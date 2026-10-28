import { periodLabel } from './invoice-builder.js';
import { money } from './invoice-pdf.js';

describe('invoice formatting', () => {
  it('formats money with grouping, exactly', () => {
    expect(money(2500000n)).toBe('25,000.00');
    expect(money(5n)).toBe('0.05');
    expect(money(-123456789n)).toBe('-1,234,567.89');
  });

  it('names billing months', () => {
    expect(periodLabel('2026-10')).toBe('October 2026');
    expect(periodLabel('2027-01')).toBe('January 2027');
  });
});
