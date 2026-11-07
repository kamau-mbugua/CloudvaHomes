import { describe, expect, it } from 'vitest';
import {
  formatGuestIdDisplay,
  toHostTrendPoints,
  verifyTotalsRowMatchesApi,
} from './ops';

describe('stays/ops — host reports, guest ID display, and totals verification', () => {
  it('verifies that the reports table totals row equals the API totals', () => {
    const summary = {
      rows: [
        {
          unitId: 'u1',
          listingId: 'l1',
          unitNumber: 'A1',
          title: 'Suite A1',
          property: { id: 'p1', code: 'P1', name: 'Prop 1' },
          received: '1050000',
          refunded: '50000',
          bookedValue: '1050000',
          unitExpenses: '200000',
          sharedExpenses: '50000',
          expenses: '250000',
          profit: '750000',
          nights: 2,
          occupancy: 0.5,
          adr: '500000',
        },
        {
          unitId: 'u2',
          listingId: 'l2',
          unitNumber: 'A2',
          title: 'Suite A2',
          property: { id: 'p1', code: 'P1', name: 'Prop 1' },
          received: '0',
          refunded: '0',
          bookedValue: '0',
          unitExpenses: '0',
          sharedExpenses: '50000',
          expenses: '50000',
          profit: '-50000',
          nights: 0,
          occupancy: 0,
          adr: '0',
        },
      ],
      totals: {
        received: '1050000',
        refunded: '50000',
        bookedValue: '1050000',
        unitExpenses: '200000',
        sharedExpenses: '100000',
        expenses: '300000',
        profit: '700000',
        nights: 2,
        occupancy: 0.25,
        adr: '500000',
      },
      sharedByProperty: [],
      monthly: [
        {
          period: '2026-10',
          received: '1050000',
          refunded: '50000',
          expenses: '300000',
          profit: '700000',
          bookedValue: '1050000',
        },
      ],
    };

    expect(verifyTotalsRowMatchesApi(summary)).toBe(true);
    expect(toHostTrendPoints(summary.monthly)).toEqual([
      {
        period: '2026-10',
        invoiced: 1050000,
        collected: 1050000,
        expenses: 300000,
      },
    ]);
  });

  it('guest detail never renders a raw ID number, only the masked hint', () => {
    expect(
      formatGuestIdDisplay({
        idNumberHint: '•••••756',
        // Even if an unexpected field were present, it is never used
        ...({ idNumber: '29384756' } as Record<string, string>),
      }),
    ).toBe('•••••756');
    expect(formatGuestIdDisplay({ idNumberHint: null })).toBe('Not recorded');
  });
});
