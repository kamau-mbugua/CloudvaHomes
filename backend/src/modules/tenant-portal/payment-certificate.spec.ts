import { parseDateOnly } from '../../common/dates/date-only.js';
import { certificateCode, certificateFigures } from './payment-certificate.js';

const d = parseDateOnly;

describe('certificateFigures', () => {
  it('counts on time, late and unpaid invoices; credit notes reduce what was billed', () => {
    const f = certificateFigures([
      // On time: paid in two parts, the second on the due date.
      {
        dueDate: d('2026-09-08'),
        net: 2_000_000n,
        allocations: [
          { amount: 1_000_000n, receivedAt: new Date('2026-09-02T10:00:00Z') },
          { amount: 1_000_000n, receivedAt: new Date('2026-09-08T18:00:00Z') },
        ],
      },
      // Late.
      {
        dueDate: d('2026-10-08'),
        net: 2_000_000n,
        allocations: [{ amount: 2_000_000n, receivedAt: d('2026-10-15') }],
      },
      // Part paid.
      {
        dueDate: d('2026-11-08'),
        net: 2_000_000n,
        allocations: [{ amount: 500_000n, receivedAt: d('2026-11-05') }],
      },
      // Fully credited: not counted.
      { dueDate: d('2026-11-08'), net: 0n, allocations: [] },
    ]);
    expect(f).toEqual({
      invoices: 3,
      billed: 6_000_000n,
      paid: 4_500_000n,
      onTime: 1,
      late: 1,
      unpaid: 1,
    });
  });

  it('makes readable codes', () => {
    let i = 0;
    expect(certificateCode(() => i++ % 31)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
  });
});
