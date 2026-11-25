import { averageUse } from './meter-math.js';

describe('averageUse', () => {
  it('returns null when fewer than 2 earlier readings exist', () => {
    expect(averageUse([])).toBeNull();
    expect(averageUse([{ previous: '100.000', current: '112.500' }])).toBeNull();
  });

  it('averages at most the newest 6 readings and rounds down to whole milli-units', () => {
    // 7 readings (newest first): newest 6 each used 10, 7th used 600 (ignored).
    const seven = [
      { previous: '150.000', current: '160.000' },
      { previous: '140.000', current: '150.000' },
      { previous: '130.000', current: '140.000' },
      { previous: '120.000', current: '130.000' },
      { previous: '110.000', current: '120.000' },
      { previous: '100.000', current: '110.000' },
      { previous: '0.000', current: '600.000' },
    ];
    expect(averageUse(seven)).toBe('10.000');

    // Non-terminating mean: (10 + 10 + 11) / 3 = 10.3333... → 10.333
    expect(
      averageUse([
        { previous: '20.000', current: '31.000' },
        { previous: '10.000', current: '20.000' },
        { previous: '0.000', current: '10.000' },
      ]),
    ).toBe('10.333');
  });

  it('uses each reading’s own current - previous across a meter swap', () => {
    // Old meter went 500 → 512 (use 12); new meter installed at 0 went 0 → 8 (use 8).
    expect(
      averageUse([
        { previous: '0.000', current: '8.000' },
        { previous: '500.000', current: '512.000' },
      ]),
    ).toBe('10.000');
  });
});
