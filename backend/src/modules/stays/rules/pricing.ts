import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';

export interface PriceInput {
  nightly: bigint;
  weekend: bigint | null;
  weeklyDiscountBps: number | null;
  /** Phase 21: 28+ nights; replaces the weekly discount when it applies. */
  monthlyDiscountBps?: number | null;
  cleaningFee: bigint;
  /** Phase 21: per extra guest per night above `guestsIncluded` (null = no limit). */
  extraGuestFee?: bigint;
  guestsIncluded?: number | null;
  guests?: number;
  special: { from: string; to: string; nightly: bigint }[];
}

export interface QuoteLine {
  kind: 'NIGHT' | 'DISCOUNT' | 'CLEANING' | 'EXTRA_GUESTS' | 'ADJUSTMENT';
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

  // One length-of-stay discount: the monthly one for 28+ nights, else the weekly one.
  let discount = 0n;
  const monthly = nights.length >= 28 && p.monthlyDiscountBps && p.monthlyDiscountBps > 0;
  const weekly = nights.length >= 7 && p.weeklyDiscountBps && p.weeklyDiscountBps > 0;
  const bps = monthly ? p.monthlyDiscountBps! : weekly ? p.weeklyDiscountBps! : 0;
  if (bps > 0) {
    const rawDiscount = (nightsSubtotal * BigInt(bps)) / 10000n;
    // Round down to whole shillings (100 minor units).
    discount = (rawDiscount / 100n) * 100n;
    if (discount > 0n) {
      lines.push({
        kind: 'DISCOUNT',
        label: monthly ? '28+ nights discount' : '7+ nights discount',
        amount: (-discount).toString(),
      });
    }
  }

  let extraGuests = 0n;
  const extra =
    p.guestsIncluded != null && p.guests != null ? Math.max(0, p.guests - p.guestsIncluded) : 0;
  if (extra > 0 && p.extraGuestFee && p.extraGuestFee > 0n) {
    extraGuests = p.extraGuestFee * BigInt(extra) * BigInt(nights.length);
    lines.push({
      kind: 'EXTRA_GUESTS',
      label: `${extra} extra ${extra === 1 ? 'guest' : 'guests'} × ${nights.length} ${nights.length === 1 ? 'night' : 'nights'}`,
      amount: extraGuests.toString(),
    });
  }

  if (p.cleaningFee > 0n) {
    lines.push({
      kind: 'CLEANING',
      label: 'Cleaning fee',
      amount: p.cleaningFee.toString(),
    });
  }

  const total = nightsSubtotal - discount + extraGuests + p.cleaningFee;
  return {
    nights: nights.length,
    lines,
    total,
  };
}
