import { owedOn } from '../rules/balance.js';
import { addIsoDays, isoDaysBetween, occupancy } from '../rules/report-math.js';

/**
 * The host dashboard (web "Dashboard", mobile "Today"), worked out from plain rows so it can be
 * tested without a database. Dates are YYYY-MM-DD in Nairobi time; money is minor units.
 */

export type DashStatus =
  | 'HELD'
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface DashUnit {
  unitId: string;
  number: string;
  title: string;
  listingId: string;
  property: { id: string; code: string; name: string };
}

export interface DashBooking {
  id: string;
  code: string;
  kind: 'STAY' | 'BLOCK';
  unitId: string;
  status: DashStatus;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string | null;
  total: bigint;
  amountPaid: bigint;
  amountRefunded: bigint;
  amountWrittenOff: bigint;
  balanceDueOn: string | null;
  requestExpiresAt: Date | null;
}

export interface DashPayment {
  /** The day it was received (same day rule as the Reports page). */
  day: string;
  kind: 'PAYMENT' | 'REFUND';
  amount: bigint;
}

export interface DashInput {
  today: string;
  units: DashUnit[];
  bookings: DashBooking[];
  /** Units with an open cleaning task. */
  openCleaningUnitIds: ReadonlySet<string>;
  payments: DashPayment[];
  canSeeMoney: boolean;
  canSeeCleaning: boolean;
}

/** Where a stay is relative to today; the clients word it ("Arrives today", "Never checked in"…). */
export type StayStage =
  | 'UPCOMING'
  | 'ARRIVES_TODAY'
  | 'NEVER_ARRIVED'
  | 'IN_HOUSE'
  | 'LEAVES_TODAY'
  | 'OVERDUE'
  | 'CHECKED_OUT'
  | 'REQUESTED';

export interface StayRow {
  id: string;
  code: string;
  status: DashStatus;
  stage: StayStage;
  guestName: string | null;
  guests: number;
  unit: { id: string; number: string; title: string; propertyName: string };
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Arrivals only: false when the unit still has an open cleaning task. Null if unknown/hidden. */
  unitReady: boolean | null;
  requestExpiresAt: string | null;
  /** Money fields are left out unless the caller holds stay-payments:view. */
  total?: string;
  paid?: string;
  owed?: string;
  /** Balances due only: the day the balance fell due. */
  dueSince?: string;
}

export type NeedKind = 'OVERDUE_CHECKOUT' | 'UNIT_NOT_READY' | 'REQUEST' | 'NEVER_ARRIVED';

export interface Need {
  kind: NeedKind;
  booking: StayRow;
}

export type UnitNow = 'OCCUPIED' | 'LATE' | 'ARRIVING' | 'TO_CLEAN' | 'READY' | 'BLOCKED';

export interface DashMoney {
  collectedThisMonth: string;
  collectedLastMonth: string;
  /** Net collected each day of this month, from the 1st to today. */
  dailyThisMonth: string[];
  owed: string;
  owedBookings: number;
  owedOldestSince: string | null;
}

/** Statuses whose nights count as booked (same as Reports). */
const NIGHT_STATUSES: ReadonlySet<DashStatus> = new Set(['CONFIRMED', 'CHECKED_IN', 'COMPLETED']);
/** Statuses where a block actually holds the dates. */
const BLOCK_STATUSES: ReadonlySet<DashStatus> = new Set([
  'HELD',
  'REQUESTED',
  'CONFIRMED',
  'CHECKED_IN',
]);
const OWING_STATUSES: ReadonlySet<DashStatus> = new Set(['CONFIRMED', 'CHECKED_IN', 'COMPLETED']);

export const NIGHTS_AHEAD = 14;

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function nextMonthStart(iso: string): string {
  return monthStart(addIsoDays(monthStart(iso), 32));
}

function prevMonthStart(iso: string): string {
  return monthStart(addIsoDays(monthStart(iso), -1));
}

function covers(b: { checkIn: string; checkOut: string }, night: string): boolean {
  return b.checkIn <= night && night < b.checkOut;
}

function stageOf(b: DashBooking, today: string): StayStage {
  if (b.status === 'REQUESTED') return 'REQUESTED';
  if (b.status === 'COMPLETED') return 'CHECKED_OUT';
  if (b.status === 'CHECKED_IN') {
    if (b.checkOut < today) return 'OVERDUE';
    if (b.checkOut === today) return 'LEAVES_TODAY';
    return 'IN_HOUSE';
  }
  if (b.checkIn === today) return 'ARRIVES_TODAY';
  if (b.checkIn < today) return 'NEVER_ARRIVED';
  return 'UPCOMING';
}

export function buildDashboard(input: DashInput) {
  const { today, units, canSeeMoney, canSeeCleaning } = input;
  const unitById = new Map(units.map((u) => [u.unitId, u]));
  // Only bookings on units the caller can see (the listing set is already property-scoped).
  const bookings = input.bookings.filter((b) => unitById.has(b.unitId));
  const stays = bookings.filter((b) => b.kind === 'STAY');
  const blocks = bookings.filter((b) => b.kind === 'BLOCK' && BLOCK_STATUSES.has(b.status));

  const arrivalUnitIds = new Set(
    stays
      .filter((b) => b.checkIn === today && (b.status === 'CONFIRMED' || b.status === 'HELD'))
      .map((b) => b.unitId),
  );

  const row = (b: DashBooking, extra: Partial<StayRow> = {}): StayRow => {
    const u = unitById.get(b.unitId)!;
    const stage = stageOf(b, today);
    const out: StayRow = {
      id: b.id,
      code: b.code,
      status: b.status,
      stage,
      guestName: b.guestName,
      guests: b.guests,
      unit: { id: u.unitId, number: u.number, title: u.title, propertyName: u.property.name },
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: Math.max(0, isoDaysBetween(b.checkIn, b.checkOut)),
      unitReady:
        stage === 'ARRIVES_TODAY' && canSeeCleaning
          ? !input.openCleaningUnitIds.has(b.unitId)
          : null,
      requestExpiresAt: b.requestExpiresAt ? b.requestExpiresAt.toISOString() : null,
      ...extra,
    };
    if (canSeeMoney) {
      out.total = b.total.toString();
      out.paid = (b.amountPaid - b.amountRefunded).toString();
      out.owed = owedOn(b).toString();
    }
    return out;
  };

  // ── Today at your units ─────────────────────────────────────────────────────
  const byCheckIn = (a: DashBooking, b: DashBooking) =>
    a.checkIn.localeCompare(b.checkIn) || a.code.localeCompare(b.code);
  const byCheckOut = (a: DashBooking, b: DashBooking) =>
    a.checkOut.localeCompare(b.checkOut) || a.code.localeCompare(b.code);

  const arriving = stays
    .filter((b) => b.checkIn === today && (b.status === 'CONFIRMED' || b.status === 'HELD'))
    .sort(byCheckIn)
    .map((b) => row(b));
  const leaving = stays
    .filter((b) => b.status === 'CHECKED_IN' && b.checkOut === today)
    .sort(byCheckOut)
    .map((b) => row(b));
  // Overdue check-outs first, then everyone else in the house by the day they leave.
  const staying = stays
    .filter((b) => b.status === 'CHECKED_IN' && b.checkOut !== today)
    .sort(byCheckOut)
    .map((b) => row(b));

  // ── Needs you ──────────────────────────────────────────────────────────────
  const needs: Need[] = [];
  for (const b of [...stays].sort(byCheckOut)) {
    if (b.status === 'CHECKED_IN' && b.checkOut < today) {
      needs.push({ kind: 'OVERDUE_CHECKOUT', booking: row(b) });
    }
  }
  if (canSeeCleaning) {
    for (const b of [...stays].sort(byCheckIn)) {
      if (
        b.checkIn === today &&
        (b.status === 'CONFIRMED' || b.status === 'HELD') &&
        input.openCleaningUnitIds.has(b.unitId)
      ) {
        needs.push({ kind: 'UNIT_NOT_READY', booking: row(b) });
      }
    }
  }
  for (const b of [...stays].sort(byCheckIn)) {
    if (b.status === 'REQUESTED') needs.push({ kind: 'REQUEST', booking: row(b) });
  }
  for (const b of [...stays].sort(byCheckIn)) {
    if (b.status === 'CONFIRMED' && b.checkIn < today) {
      needs.push({ kind: 'NEVER_ARRIVED', booking: row(b) });
    }
  }

  // ── Nights ahead and occupancy ─────────────────────────────────────────────
  const counted = stays.filter((b) => NIGHT_STATUSES.has(b.status));
  const bookedUnitsOn = (night: string) =>
    new Set(counted.filter((b) => covers(b, night)).map((b) => b.unitId)).size;
  const nights = Array.from({ length: NIGHTS_AHEAD }, (_, i) => {
    const date = addIsoDays(today, i);
    return { date, booked: bookedUnitsOn(date) };
  });

  const mStart = monthStart(today);
  const mEnd = addIsoDays(nextMonthStart(today), -1);
  const daysInMonth = isoDaysBetween(mStart, mEnd) + 1;
  let bookedNights = 0;
  let blockedNights = 0;
  for (let i = 0; i < daysInMonth; i++) {
    const night = addIsoDays(mStart, i);
    bookedNights += bookedUnitsOn(night);
    blockedNights += new Set(blocks.filter((b) => covers(b, night)).map((b) => b.unitId)).size;
  }
  const occupiedTonight = nights[0]?.booked ?? 0;

  // ── Units right now ────────────────────────────────────────────────────────
  const statusOf = (unitId: string): UnitNow => {
    if (blocks.some((b) => b.unitId === unitId && covers(b, today))) return 'BLOCKED';
    const inHouse = stays.filter((b) => b.unitId === unitId && b.status === 'CHECKED_IN');
    if (inHouse.some((b) => b.checkOut < today)) return 'LATE';
    if (inHouse.length > 0) return 'OCCUPIED';
    if (canSeeCleaning && input.openCleaningUnitIds.has(unitId)) return 'TO_CLEAN';
    if (arrivalUnitIds.has(unitId)) return 'ARRIVING';
    return 'READY';
  };
  const counts: Record<UnitNow, number> = {
    OCCUPIED: 0,
    LATE: 0,
    ARRIVING: 0,
    TO_CLEAN: 0,
    READY: 0,
    BLOCKED: 0,
  };
  const groupMap = new Map<
    string,
    {
      property: { id: string; code: string; name: string };
      units: {
        unitId: string;
        listingId: string;
        number: string;
        title: string;
        status: UnitNow;
      }[];
    }
  >();
  for (const u of units) {
    const status = statusOf(u.unitId);
    counts[status] += 1;
    const g = groupMap.get(u.property.id) ?? { property: u.property, units: [] };
    g.units.push({
      unitId: u.unitId,
      listingId: u.listingId,
      number: u.number,
      title: u.title,
      status,
    });
    groupMap.set(u.property.id, g);
  }

  // ── Money ──────────────────────────────────────────────────────────────────
  let money: DashMoney | null = null;
  let balances: StayRow[] = [];
  if (canSeeMoney) {
    const lastStart = prevMonthStart(today);
    const todayIndex = isoDaysBetween(mStart, today);
    const daily = Array.from({ length: todayIndex + 1 }, () => 0n);
    let thisMonth = 0n;
    let lastMonth = 0n;
    for (const p of input.payments) {
      const signed = p.kind === 'PAYMENT' ? p.amount : -p.amount;
      if (p.day >= mStart && p.day <= today) {
        thisMonth += signed;
        daily[isoDaysBetween(mStart, p.day)]! += signed;
      } else if (p.day >= lastStart && p.day < mStart) {
        lastMonth += signed;
      }
    }

    const due = stays
      .filter((b) => OWING_STATUSES.has(b.status) && owedOn(b) > 0n)
      .map((b) => ({ b, dueOn: b.balanceDueOn ?? b.checkIn }))
      .filter((x) => x.dueOn <= today)
      .sort((x, y) => x.dueOn.localeCompare(y.dueOn) || x.b.code.localeCompare(y.b.code));
    balances = due.map((x) => row(x.b, { dueSince: x.dueOn }));
    const owed = due.reduce((sum, x) => sum + owedOn(x.b), 0n);

    money = {
      collectedThisMonth: thisMonth.toString(),
      collectedLastMonth: lastMonth.toString(),
      dailyThisMonth: daily.map((d) => d.toString()),
      owed: owed.toString(),
      owedBookings: due.length,
      owedOldestSince: due[0]?.dueOn ?? null,
    };
  }

  const properties = [...groupMap.values()].map((g) => g.property);

  return {
    today,
    summary: {
      units: units.length,
      properties,
      occupiedTonight,
      occupancyTonight: units.length ? occupiedTonight / units.length : 0,
      occupancyMonth: occupancy(bookedNights, units.length, mStart, mEnd, blockedNights),
      toClean: canSeeCleaning
        ? units.filter((u) => input.openCleaningUnitIds.has(u.unitId)).length
        : null,
      toCleanBeforeArrival: canSeeCleaning
        ? units.filter(
            (u) => input.openCleaningUnitIds.has(u.unitId) && arrivalUnitIds.has(u.unitId),
          ).length
        : null,
      money,
    },
    stays: { arriving, leaving, staying },
    needs,
    nights,
    units: { counts, groups: [...groupMap.values()] },
    balances,
  };
}

export type HostDashboard = ReturnType<typeof buildDashboard>;
