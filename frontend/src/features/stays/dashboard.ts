import { formatKES } from '../../lib/money';
import type { BookingStatus } from './types';

/** `GET /host/dashboard` — what the host Dashboard shows. Money is minor units as strings. */
export type StayStage =
  | 'UPCOMING'
  | 'ARRIVES_TODAY'
  | 'NEVER_ARRIVED'
  | 'IN_HOUSE'
  | 'LEAVES_TODAY'
  | 'OVERDUE'
  | 'CHECKED_OUT'
  | 'REQUESTED';

export interface DashRow {
  id: string;
  code: string;
  status: BookingStatus;
  stage: StayStage;
  guestName: string | null;
  guests: number;
  unit: { id: string; number: string; title: string; propertyName: string };
  checkIn: string;
  checkOut: string;
  nights: number;
  unitReady: boolean | null;
  requestExpiresAt: string | null;
  total?: string;
  paid?: string;
  owed?: string;
  dueSince?: string;
}

export type NeedKind = 'OVERDUE_CHECKOUT' | 'UNIT_NOT_READY' | 'REQUEST' | 'NEVER_ARRIVED';
export type UnitNow = 'OCCUPIED' | 'LATE' | 'ARRIVING' | 'TO_CLEAN' | 'READY' | 'BLOCKED';

export interface HostDashboard {
  today: string;
  summary: {
    units: number;
    properties: { id: string; code: string; name: string }[];
    occupiedTonight: number;
    occupancyTonight: number;
    occupancyMonth: number;
    toClean: number | null;
    toCleanBeforeArrival: number | null;
    money: {
      collectedThisMonth: string;
      collectedLastMonth: string;
      dailyThisMonth: string[];
      owed: string;
      owedBookings: number;
      owedOldestSince: string | null;
    } | null;
  };
  stays: { arriving: DashRow[]; leaving: DashRow[]; staying: DashRow[] };
  needs: { kind: NeedKind; booking: DashRow }[];
  nights: { date: string; booked: number }[];
  units: {
    counts: Record<UnitNow, number>;
    groups: {
      property: { id: string; code: string; name: string };
      units: { unitId: string; listingId: string; number: string; title: string; status: UnitNow }[];
    }[];
  };
  balances: DashRow[];
}

export type Tone = 'ok' | 'due' | 'warn' | 'bad' | 'info' | 'plain';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(iso: string): { y: number; m: number; d: number; dow: number } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Good morning" before noon, "Good afternoon" until 17:00, then "Good evening". */
export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** 2026-11-21 → "Saturday, 21 November". */
export function longDate(iso: string): string {
  const p = parts(iso);
  return `${DAYS_LONG[p.dow]}, ${p.d} ${MONTHS_LONG[p.m - 1]}`;
}

/** 2026-11-21 → "Sat 21". */
export function shortDay(iso: string): string {
  const p = parts(iso);
  return `${DAYS[p.dow]} ${p.d}`;
}

/** 2026-11-21 → "21 Nov". */
export function dayMonth(iso: string): string {
  const p = parts(iso);
  return `${p.d} ${MONTHS[p.m - 1]}`;
}

export function monthName(iso: string): string {
  return MONTHS_LONG[parts(iso).m - 1]!;
}

/** "21 → 23 Nov", or "28 Nov → 2 Dec" across months. */
export function stayRange(checkIn: string, checkOut: string): string {
  const a = parts(checkIn);
  const b = parts(checkOut);
  return a.m === b.m && a.y === b.y
    ? `${a.d} → ${b.d} ${MONTHS[b.m - 1]}`
    : `${dayMonth(checkIn)} → ${dayMonth(checkOut)}`;
}

/** The two-line date tile beside a row in "Today at your units". */
export function rowChip(r: DashRow): { top: string; bottom: string; tone: 'arrive' | 'late' | 'plain' } {
  switch (r.stage) {
    case 'ARRIVES_TODAY':
      return { top: 'Today', bottom: 'check-in', tone: 'arrive' };
    case 'LEAVES_TODAY':
      return { top: 'Today', bottom: 'check-out', tone: 'plain' };
    case 'OVERDUE':
      return { top: String(parts(r.checkOut).d), bottom: `${MONTHS[parts(r.checkOut).m - 1]}, late`, tone: 'late' };
    default:
      return { top: String(parts(r.checkOut).d), bottom: MONTHS[parts(r.checkOut).m - 1]!, tone: 'plain' };
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The line under a guest's name: "3 nights, to Tue 24" / "was due out Thu 19". */
export function rowStayText(r: DashRow): string {
  switch (r.stage) {
    case 'ARRIVES_TODAY':
      return `${plural(r.nights, 'night')}, to ${shortDay(r.checkOut)}`;
    case 'LEAVES_TODAY':
      return `${plural(r.nights, 'night')}, from ${shortDay(r.checkIn)}`;
    case 'OVERDUE':
      return `was due out ${shortDay(r.checkOut)}`;
    default:
      return `leaves ${shortDay(r.checkOut)}`;
  }
}

/** The payment pill, or null when the caller can't see money. */
export function payPill(r: DashRow): { label: string; tone: Tone } | null {
  if (r.owed === undefined) return null;
  const owed = BigInt(r.owed);
  if (owed > 0n) return { label: `${formatKES(Number(owed))} due`, tone: 'due' };
  return {
    label: r.stage === 'ARRIVES_TODAY' || r.stage === 'UPCOMING' ? 'Paid in full' : 'Settled',
    tone: 'ok',
  };
}

/** The readiness pill: arrivals say whether the unit is clean; overdue stays say so. */
export function readyPill(r: DashRow): { label: string; tone: Tone } | null {
  if (r.stage === 'OVERDUE') return { label: 'Check-out overdue', tone: 'bad' };
  if (r.unitReady === true) return { label: 'Unit ready', tone: 'ok' };
  if (r.unitReady === false) return { label: 'Not cleaned yet', tone: 'warn' };
  return null;
}

export type RowAction = 'check-in' | 'check-out' | 'open';

export function rowAction(r: DashRow): { action: RowAction; label: string; primary: boolean } {
  if (r.stage === 'ARRIVES_TODAY' && r.status === 'CONFIRMED') {
    return { action: 'check-in', label: 'Check in', primary: r.unitReady !== false };
  }
  if (r.stage === 'LEAVES_TODAY' || r.stage === 'OVERDUE') {
    return { action: 'check-out', label: 'Check out', primary: true };
  }
  return { action: 'open', label: 'Open', primary: false };
}

export interface NeedView {
  tone: 'red' | 'amber' | 'blue';
  title: string;
  detail: string;
  action: { kind: 'check-out' | 'no-show' | 'open-booking' | 'open-cleaning'; label: string };
}

function where(r: DashRow): string {
  return `${r.unit.title}, ${r.unit.propertyName} ${r.unit.number}`;
}

export function needView(n: { kind: NeedKind; booking: DashRow }): NeedView {
  const r = n.booking;
  const guest = r.guestName ?? 'The guest';
  switch (n.kind) {
    case 'OVERDUE_CHECKOUT':
      return {
        tone: 'red',
        title: 'Check-out overdue',
        detail: `${where(r)}. ${guest} was due out ${shortDay(r.checkOut)} ${MONTHS[parts(r.checkOut).m - 1]} and is still checked in.`,
        action: { kind: 'check-out', label: 'Check out' },
      };
    case 'UNIT_NOT_READY':
      return {
        tone: 'amber',
        title: 'Unit not ready for an arrival',
        detail: `${where(r)}. ${guest} checks in today and the unit has not been cleaned.`,
        action: { kind: 'open-cleaning', label: 'Open cleaning' },
      };
    case 'REQUEST': {
      const money = r.total !== undefined ? `, ${formatKES(Number(r.total))}` : '';
      return {
        tone: 'blue',
        title: 'Booking request from your site',
        detail: `${guest}, ${r.unit.title}, ${stayRange(r.checkIn, r.checkOut)}, ${plural(r.guests, 'guest')}${money}.`,
        action: { kind: 'open-booking', label: 'Review' },
      };
    }
    case 'NEVER_ARRIVED': {
      const paid = r.owed !== undefined && BigInt(r.owed) > 0n ? ' Unpaid,' : '';
      return {
        tone: 'amber',
        title: 'Guest never arrived',
        detail: `${r.code}, ${r.unit.title}, ${stayRange(r.checkIn, r.checkOut)}.${paid} still marked confirmed.`,
        action: { kind: 'no-show', label: 'Mark no-show' },
      };
    }
  }
}

/** "Up 27% on October (KES 54,200.00)" — null when last month had nothing to compare with. */
export function versusLastMonth(thisMonth: bigint, lastMonth: bigint, lastMonthName: string): { text: string; up: boolean } | null {
  if (lastMonth <= 0n) return null;
  const pct = Math.round((Number(thisMonth - lastMonth) / Number(lastMonth)) * 100);
  const up = pct >= 0;
  return {
    text: `${up ? 'Up' : 'Down'} ${Math.abs(pct)}% on ${lastMonthName} (${formatKES(Number(lastMonth))})`,
    up,
  };
}

/** The line under the nights chart: the busiest night(s), or that nothing is booked. */
export function nightsSummary(nights: { date: string; booked: number }[], units: number): string {
  const max = Math.max(0, ...nights.map((n) => n.booked));
  if (max === 0) return `No units booked in the next ${plural(nights.length, 'night')}.`;
  const busiest = nights.filter((n) => n.booked === max).map((n) => shortDay(n.date));
  const list =
    busiest.length <= 2 ? busiest.join(' and ') : `${busiest.slice(0, 2).join(', ')} and ${busiest.length - 2} more`;
  const verb = busiest.length === 1 ? 'is your busiest night' : 'are your busiest nights';
  return `${list} ${verb}, with ${max} of ${units} units booked.`;
}

export const UNIT_NOW: Record<UnitNow, { label: string; short: string }> = {
  OCCUPIED: { label: 'occupied', short: 'In' },
  LATE: { label: 'late check-out', short: 'Late' },
  ARRIVING: { label: 'arriving', short: 'Arr.' },
  TO_CLEAN: { label: 'to clean', short: 'Clean' },
  READY: { label: 'ready', short: 'Ready' },
  BLOCKED: { label: 'blocked', short: 'Block' },
};

export const UNIT_NOW_ORDER: UnitNow[] = ['OCCUPIED', 'LATE', 'ARRIVING', 'TO_CLEAN', 'READY', 'BLOCKED'];
