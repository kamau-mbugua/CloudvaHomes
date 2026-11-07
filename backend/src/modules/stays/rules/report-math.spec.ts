import { describe, expect, it } from 'vitest';
import { adr, bookedByNight, occupancy } from './report-math.js';

describe('stays/rules/report-math', () => {
  it('bookedByNight spreads nights and puts cleaning fee + adjustments on the first night', () => {
    const byMonth = bookedByNight(
      [
        {
          checkIn: '2026-11-30',
          checkOut: '2026-12-03',
          status: 'CONFIRMED',
          total: 650_000n,
          lines: [
            { kind: 'NIGHTS', label: '3 nights', amount: '600000' },
            { kind: 'CLEANING', label: 'Cleaning fee', amount: '50000' },
          ],
        },
        {
          checkIn: '2026-12-05',
          checkOut: '2026-12-07',
          status: 'CANCELLED',
          total: 400_000n,
          lines: [{ kind: 'NIGHTS', label: '2 nights', amount: '400000' }],
        },
      ],
      '2026-11-01',
      '2026-12-31',
    );

    expect(byMonth.get('2026-11')).toBe(250_000n);
    expect(byMonth.get('2026-12')).toBe(400_000n);
  });

  it('occupancy computes bookedNights / availableNights excluding blocked nights', () => {
    const rate = occupancy(15, 2, '2026-12-01', '2026-12-31');
    expect(rate).toBeCloseTo(15 / 62, 4);

    // With 2 blocked nights out of 62 -> 15 / 60 = 0.25
    const rateWithBlocks = occupancy(15, 2, '2026-12-01', '2026-12-31', 2);
    expect(rateWithBlocks).toBeCloseTo(0.25, 4);
  });

  it('adr rounds down to whole shillings (multiples of 100 minor units)', () => {
    // 700,000 minor units (KES 7,000) / 3 nights = KES 2,333 -> 233,300 minor units
    expect(adr(700_000n, 3)).toBe(233_300n);
    expect(adr(0n, 0)).toBe(0n);
  });
});
