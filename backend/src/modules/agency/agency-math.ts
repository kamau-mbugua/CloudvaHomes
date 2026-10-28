/** Pure agency-accounting rules (BigInt cents). */

export interface WaterfallLine {
  kind: 'RENT' | 'CHARGE' | 'MOVE_IN' | 'ADJUSTMENT';
  refundable: boolean;
  amount: bigint;
  position: number;
}

export interface Portion {
  kind: WaterfallLine['kind'];
  refundable: boolean;
  amount: bigint; // negative when money is taken back
}

/**
 * Which lines an allocation pays. An invoice is paid in line order — refundable (deposit)
 * lines first, then by position (rent is first) — so moving the paid total from `before` to
 * `after` covers exactly one stretch of that order. A reversal (after < before) uncovers the
 * same stretch, giving negative portions that mirror the original ones.
 */
export function waterfall(lines: WaterfallLine[], before: bigint, after: bigint): Portion[] {
  const ordered = [...lines].sort(
    (a, b) => Number(b.refundable) - Number(a.refundable) || a.position - b.position,
  );
  const lo = before < after ? before : after;
  const hi = before < after ? after : before;
  const sign = after >= before ? 1n : -1n;
  const out: Portion[] = [];
  let start = 0n;
  for (const l of ordered) {
    const end = start + l.amount;
    const overlap = (hi < end ? hi : end) - (lo > start ? lo : start);
    if (overlap > 0n) out.push({ kind: l.kind, refundable: l.refundable, amount: sign * overlap });
    start = end;
  }
  return out;
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  propertyIds: string[]; // empty = all
}

/** Two agreements for one landlord clash if their dates overlap and they share a property. */
export function overlaps(a: DateRange, b: DateRange): boolean {
  const datesOverlap =
    (a.endDate === null || a.endDate >= b.startDate) &&
    (b.endDate === null || b.endDate >= a.startDate);
  if (!datesOverlap) return false;
  if (!a.propertyIds.length || !b.propertyIds.length) return true;
  return a.propertyIds.some((p) => b.propertyIds.includes(p));
}

/** Whether an agreement covers a property on a date. */
export function covers(a: DateRange, propertyId: string, date: string): boolean {
  return (
    a.startDate <= date &&
    (a.endDate === null || a.endDate >= date) &&
    (!a.propertyIds.length || a.propertyIds.includes(propertyId))
  );
}

/** Remittance direction and amount from the payable balance. */
export function remittanceFor(balance: bigint): {
  direction: 'TO_LANDLORD' | 'FROM_LANDLORD';
  net: bigint;
} {
  return balance >= 0n
    ? { direction: 'TO_LANDLORD', net: balance }
    : { direction: 'FROM_LANDLORD', net: -balance };
}
