import { describe, expect, it } from 'vitest';
import { isInHouse } from './today';

const TODAY = '2026-11-09';
const stay = (status: string, checkIn: string, checkOut: string) => ({ status, checkIn, checkOut });

describe('Today page: who is in-house', () => {
  it('lists checked-in guests', () => {
    expect(isInHouse(stay('CHECKED_IN', '2026-11-08', '2026-11-11'), TODAY)).toBe(true);
  });

  it('does not list today’s arrivals who have not checked in (they are under Arrivals)', () => {
    expect(isInHouse(stay('CONFIRMED', TODAY, '2026-11-11'), TODAY)).toBe(false);
  });

  it('still lists a confirmed stay that started earlier but was never checked in', () => {
    expect(isInHouse(stay('CONFIRMED', '2026-11-07', '2026-11-11'), TODAY)).toBe(true);
    expect(isInHouse(stay('CONFIRMED', '2026-11-07', TODAY), TODAY)).toBe(false);
  });
});
