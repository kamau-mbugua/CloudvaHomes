import { describe, expect, it } from 'vitest';
import {
  buildDashboard,
  type DashBooking,
  type DashInput,
  type DashUnit,
} from './dashboard-math.js';

const TODAY = '2026-11-21';
const KES = (n: number) => BigInt(n * 100);

const unit = (n: string, prop = 'p1', name = 'Makini Court'): DashUnit => ({
  unitId: `u${n}`,
  number: n,
  title: `Unit ${n}`,
  listingId: `l${n}`,
  property: { id: prop, code: prop.toUpperCase(), name },
});

let seq = 0;
const stay = (
  b: Partial<DashBooking> & Pick<DashBooking, 'unitId' | 'checkIn' | 'checkOut' | 'status'>,
): DashBooking => ({
  id: `b${++seq}`,
  code: `B${String(seq).padStart(5, '0')}`,
  kind: 'STAY',
  guests: 2,
  guestName: `Guest ${seq}`,
  total: KES(10_000),
  amountPaid: KES(10_000),
  amountRefunded: 0n,
  amountWrittenOff: 0n,
  balanceDueOn: null,
  requestExpiresAt: null,
  ...b,
});

const base = (over: Partial<DashInput> = {}): DashInput => ({
  today: TODAY,
  units: [unit('101'), unit('102'), unit('103'), unit('104'), unit('401', 'p2', 'Kileleshwa')],
  bookings: [],
  openCleaningUnitIds: new Set(),
  payments: [],
  canSeeMoney: true,
  canSeeCleaning: true,
  ...over,
});

describe('buildDashboard', () => {
  it('sorts stays into arriving, leaving and staying, overdue first', () => {
    const d = buildDashboard(
      base({
        bookings: [
          stay({ unitId: 'u101', checkIn: TODAY, checkOut: '2026-11-24', status: 'CONFIRMED' }),
          stay({
            unitId: 'u102',
            checkIn: '2026-11-15',
            checkOut: '2026-11-19',
            status: 'CHECKED_IN',
          }),
          stay({ unitId: 'u103', checkIn: '2026-11-17', checkOut: TODAY, status: 'CHECKED_IN' }),
          stay({
            unitId: 'u104',
            checkIn: '2026-11-20',
            checkOut: '2026-11-25',
            status: 'CHECKED_IN',
          }),
        ],
      }),
    );
    expect(d.stays.arriving.map((r) => r.unit.number)).toEqual(['101']);
    expect(d.stays.leaving.map((r) => r.unit.number)).toEqual(['103']);
    expect(d.stays.staying.map((r) => [r.unit.number, r.stage])).toEqual([
      ['102', 'OVERDUE'],
      ['104', 'IN_HOUSE'],
    ]);
    expect(d.units.counts).toMatchObject({ LATE: 1, OCCUPIED: 2, ARRIVING: 1, READY: 1 });
  });

  it('flags overdue check-outs, dirty units for arrivals, requests and guests who never arrived', () => {
    const d = buildDashboard(
      base({
        openCleaningUnitIds: new Set(['u401']),
        bookings: [
          stay({
            unitId: 'u102',
            checkIn: '2026-11-15',
            checkOut: '2026-11-19',
            status: 'CHECKED_IN',
          }),
          stay({ unitId: 'u401', checkIn: TODAY, checkOut: '2026-11-23', status: 'CONFIRMED' }),
          stay({
            unitId: 'u101',
            checkIn: '2026-11-28',
            checkOut: '2026-12-02',
            status: 'REQUESTED',
          }),
          stay({
            unitId: 'u103',
            checkIn: '2026-11-14',
            checkOut: '2026-11-20',
            status: 'CONFIRMED',
            amountPaid: 0n,
          }),
        ],
      }),
    );
    expect(d.needs.map((n) => [n.kind, n.booking.unit.number])).toEqual([
      ['OVERDUE_CHECKOUT', '102'],
      ['UNIT_NOT_READY', '401'],
      ['REQUEST', '101'],
      ['NEVER_ARRIVED', '103'],
    ]);
    expect(d.stays.arriving[0]!.unitReady).toBe(false);
    expect(d.units.groups.find((g) => g.property.id === 'p2')!.units[0]!.status).toBe('TO_CLEAN');
    expect(d.summary.toClean).toBe(1);
    expect(d.summary.toCleanBeforeArrival).toBe(1);
  });

  it('counts units booked each night and this month, leaving out blocked nights from what is available', () => {
    const d = buildDashboard(
      base({
        bookings: [
          stay({
            unitId: 'u101',
            checkIn: '2026-11-20',
            checkOut: '2026-11-23',
            status: 'CHECKED_IN',
          }),
          stay({ unitId: 'u102', checkIn: TODAY, checkOut: '2026-11-22', status: 'CONFIRMED' }),
          // Held and cancelled stays don't count as booked.
          stay({ unitId: 'u103', checkIn: TODAY, checkOut: '2026-11-22', status: 'HELD' }),
          stay({ unitId: 'u104', checkIn: TODAY, checkOut: '2026-11-22', status: 'CANCELLED' }),
          stay({
            unitId: 'u401',
            kind: 'BLOCK',
            checkIn: TODAY,
            checkOut: '2026-11-26',
            status: 'CONFIRMED',
          }),
        ],
      }),
    );
    expect(d.nights).toHaveLength(14);
    expect(d.nights.slice(0, 3).map((n) => n.booked)).toEqual([2, 1, 0]);
    expect(d.summary.occupiedTonight).toBe(2);
    expect(d.summary.occupancyTonight).toBeCloseTo(2 / 5);
    // 3 + 1 booked nights over 5 units × 30 days less 5 blocked nights.
    expect(d.summary.occupancyMonth).toBeCloseTo(4 / 145);
    expect(d.units.counts.BLOCKED).toBe(1);
  });

  it('totals money collected this month and last, and lists balances already due', () => {
    const d = buildDashboard(
      base({
        payments: [
          { day: '2026-10-05', kind: 'PAYMENT', amount: KES(54_200) },
          { day: '2026-11-01', kind: 'PAYMENT', amount: KES(70_000) },
          { day: '2026-11-21', kind: 'REFUND', amount: KES(1_100) },
          { day: '2026-11-22', kind: 'PAYMENT', amount: KES(999) },
        ],
        bookings: [
          stay({
            unitId: 'u401',
            checkIn: TODAY,
            checkOut: '2026-11-23',
            status: 'CONFIRMED',
            total: KES(20_000),
            amountPaid: KES(10_000),
          }),
          stay({
            unitId: 'u101',
            checkIn: '2026-11-14',
            checkOut: '2026-11-20',
            status: 'CONFIRMED',
            total: KES(28_000),
            amountPaid: 0n,
          }),
          // Not due yet: the balance falls due on arrival next week.
          stay({
            unitId: 'u102',
            checkIn: '2026-11-27',
            checkOut: '2026-11-29',
            status: 'CONFIRMED',
            total: KES(9_000),
            amountPaid: KES(3_000),
          }),
        ],
      }),
    );
    const m = d.summary.money!;
    expect(m.collectedThisMonth).toBe(KES(68_900).toString());
    expect(m.collectedLastMonth).toBe(KES(54_200).toString());
    expect(m.dailyThisMonth).toHaveLength(21);
    expect(m.dailyThisMonth[0]).toBe(KES(70_000).toString());
    expect(m.owed).toBe(KES(38_000).toString());
    expect(m.owedBookings).toBe(2);
    expect(m.owedOldestSince).toBe('2026-11-14');
    expect(d.balances.map((b) => [b.unit.number, b.stage, b.owed])).toEqual([
      ['101', 'NEVER_ARRIVED', KES(28_000).toString()],
      ['401', 'ARRIVES_TODAY', KES(10_000).toString()],
    ]);
  });

  it('hides money and cleaning from callers without those permissions', () => {
    const d = buildDashboard(
      base({
        canSeeMoney: false,
        canSeeCleaning: false,
        openCleaningUnitIds: new Set(['u101']),
        bookings: [
          stay({ unitId: 'u101', checkIn: TODAY, checkOut: '2026-11-23', status: 'CONFIRMED' }),
        ],
      }),
    );
    expect(d.summary.money).toBeNull();
    expect(d.balances).toEqual([]);
    expect(d.summary.toClean).toBeNull();
    expect(d.stays.arriving[0]).not.toHaveProperty('owed');
    expect(d.stays.arriving[0]!.unitReady).toBeNull();
    expect(d.needs).toEqual([]);
    expect(d.units.counts.ARRIVING).toBe(1);
  });

  it('ignores bookings on units outside the caller’s scope', () => {
    const d = buildDashboard(
      base({
        bookings: [
          stay({ unitId: 'u999', checkIn: TODAY, checkOut: '2026-11-23', status: 'CONFIRMED' }),
        ],
      }),
    );
    expect(d.stays.arriving).toEqual([]);
  });
});
