/**
 * Whole-shilling input parsing for short stays.
 * The API stores and returns money as stringified minor units (KES cents), where
 * every short-stay price is a whole number of shillings (multiple of 100 cents).
 * Display formatting uses `formatKES` from `../../lib/money`.
 */

export function toMinorString(kes: string): string | null {
  const cleaned = kes.replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = BigInt(cleaned);
  return (n * 100n).toString();
}

export function fromMinor(minor: string | number | null | undefined): string {
  if (minor === null || minor === undefined || minor === '') return '';
  const s = String(minor).trim();
  if (!/^-?\d+$/.test(s)) return '';
  return (BigInt(s) / 100n).toString();
}
