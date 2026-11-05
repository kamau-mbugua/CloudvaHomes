import { describe, expect, it } from 'vitest';
import { addDays, todayInNairobi } from '../billing/billing-math.js';
import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { homeStatus } from './home-status.js';

const TODAY = todayInNairobi();
const day = (n: number) => formatDateOnly(addDays(parseDateOnly(TODAY), n));

describe('homeStatus', () => {
  const open = [
    { tenancyId: 't1', balance: 500000n, dueDate: day(-1) },
    { tenancyId: 't1', balance: 300000n, dueDate: day(10) },
    { tenancyId: 't2', balance: 900000n, dueDate: day(-20) },
  ];

  it('adds up what one home owes and how late it is', () => {
    expect(homeStatus(open, 't1', TODAY)).toEqual({
      due: 800000n,
      overdue: 500000n,
      daysLate: 1,
      nextDueDate: day(10),
    });
  });

  it('counts days late from the oldest overdue bill', () => {
    expect(homeStatus(open, 't2', TODAY)).toMatchObject({ overdue: 900000n, daysLate: 20 });
  });

  it('is all zero for a home with nothing open', () => {
    expect(homeStatus(open, 't3', TODAY)).toEqual({
      due: 0n,
      overdue: 0n,
      daysLate: 0,
      nextDueDate: null,
    });
  });
});
