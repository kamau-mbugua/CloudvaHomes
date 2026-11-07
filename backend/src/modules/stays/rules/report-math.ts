const DAY_MS = 86_400_000;
const COUNTED_STATUSES = new Set(['CONFIRMED', 'CHECKED_IN', 'COMPLETED']);

export interface ReportBookingLine {
  kind: string;
  label?: string;
  amount: string | number | bigint;
}

export interface ReportBookingInput {
  checkIn: string;
  checkOut: string;
  status?: string;
  total: bigint;
  lines?: unknown;
}

export function isoDaysBetween(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00Z`).getTime();
  const e = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((e - s) / DAY_MS);
}

export function addIsoDays(startIso: string, days: number): string {
  const s = new Date(`${startIso}T00:00:00Z`).getTime();
  return new Date(s + days * DAY_MS).toISOString().slice(0, 10);
}

export function nightAllocationsForStay(
  b: ReportBookingInput,
): { date: string; amount: bigint; roomAmount: bigint }[] {
  if (b.status && !COUNTED_STATUSES.has(b.status)) {
    return [];
  }
  const nights = isoDaysBetween(b.checkIn, b.checkOut);
  if (nights <= 0) return [];

  let firstNightExtras = 0n;
  if (Array.isArray(b.lines)) {
    for (const raw of b.lines as ReportBookingLine[]) {
      if (raw && (raw.kind === 'CLEANING' || raw.kind === 'ADJUSTMENT')) {
        firstNightExtras += BigInt(String(raw.amount ?? '0'));
      }
    }
  }

  const roomTotal = b.total - firstNightExtras;
  const nBig = BigInt(nights);
  const basePerNight = roomTotal / nBig;
  const remainder = roomTotal - basePerNight * nBig;

  const out: { date: string; amount: bigint; roomAmount: bigint }[] = [];
  for (let i = 0; i < nights; i++) {
    const date = addIsoDays(b.checkIn, i);
    const roomNight = i === 0 ? basePerNight + remainder : basePerNight;
    const totalNight = i === 0 ? roomNight + firstNightExtras : roomNight;
    out.push({ date, amount: totalNight, roomAmount: roomNight });
  }
  return out;
}

export function bookedByNight(
  bookings: ReportBookingInput[],
  from: string,
  to: string,
): Map<string, bigint> {
  const byMonth = new Map<string, bigint>();
  for (const b of bookings) {
    const nights = nightAllocationsForStay(b);
    for (const n of nights) {
      if (n.date < from || n.date > to) continue;
      const period = n.date.slice(0, 7);
      byMonth.set(period, (byMonth.get(period) ?? 0n) + n.amount);
    }
  }
  return byMonth;
}

export function occupancy(
  bookedNights: number,
  units: number,
  from: string,
  to: string,
  blockedNights = 0,
): number {
  if (units <= 0 || bookedNights <= 0) return 0;
  const days = isoDaysBetween(from, to) + 1;
  if (days <= 0) return 0;
  const available = units * days - blockedNights;
  if (available <= 0) return 0;
  return Math.min(1, Math.max(0, bookedNights / available));
}

export function adr(roomRevenue: bigint, bookedNights: number): bigint {
  if (bookedNights <= 0 || roomRevenue <= 0n) return 0n;
  const raw = roomRevenue / BigInt(bookedNights);
  return (raw / 100n) * 100n;
}
