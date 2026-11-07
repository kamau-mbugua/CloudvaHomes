import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';

export interface PriceInput {
  nightly: bigint;
  weekend: bigint | null;
  weeklyDiscountBps: number | null;
  cleaningFee: bigint;
  special: { from: string; to: string; nightly: bigint }[];
}

export interface QuoteLine {
  kind: 'NIGHT' | 'DISCOUNT' | 'CLEANING' | 'ADJUSTMENT';
  date?: string;
  label: string;
  amount: string;
}

export interface Quote {
  nights: number;
  lines: QuoteLine[];
  total: bigint;
}

const DAY_MS = 86_400_000;

export function nightsOf(checkIn: string, checkOut: string): string[] {
  const start = parseDateOnly(checkIn).getTime();
  const end = parseDateOnly(checkOut).getTime();
  if (end <= start) {
    throw new RangeError('Check-out must be after check-in');
  }
  const nights: string[] = [];
  for (let t = start; t < end; t += DAY_MS) {
    nights.push(formatDateOnly(new Date(t)));
  }
  return nights;
}

export function quoteStay(checkIn: string, checkOut: string, p: PriceInput): Quote {
  const nights = nightsOf(checkIn, checkOut);
  const lines: QuoteLine[] = [];
  let nightsSubtotal = 0n;

  for (const d of nights) {
    const specialMatch = p.special.find((s) => s.from <= d && d <= s.to);
    let rate: bigint;
    if (specialMatch) {
      rate = specialMatch.nightly;
    } else {
      const dow = new Date(`${d}T00:00:00.000Z`).getUTCDay();
      const isWeekend = dow === 5 || dow === 6; // Friday and Saturday nights
      rate = isWeekend && p.weekend !== null ? p.weekend : p.nightly;
    }
    nightsSubtotal += rate;
    lines.push({
      kind: 'NIGHT',
      date: d,
      label: `Night of ${d}`,
      amount: rate.toString(),
    });
  }

  let discount = 0n;
  if (nights.length >= 7 && p.weeklyDiscountBps && p.weeklyDiscountBps > 0) {
    const rawDiscount = (nightsSubtotal * BigInt(p.weeklyDiscountBps)) / 10000n;
    // Round down to whole shillings (100 minor units).
    discount = (rawDiscount / 100n) * 100n;
    if (discount > 0n) {
      lines.push({
        kind: 'DISCOUNT',
        label: '7+ nights discount',
        amount: (-discount).toString(),
      });
    }
  }

  if (p.cleaningFee > 0n) {
    lines.push({
      kind: 'CLEANING',
      label: 'Cleaning fee',
      amount: p.cleaningFee.toString(),
    });
  }

  const total = nightsSubtotal - discount + p.cleaningFee;
  return {
    nights: nights.length,
    lines,
    total,
  };
}
