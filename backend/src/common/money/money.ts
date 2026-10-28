/**
 * Money is always an integer number of minor units (cents) held in a BigInt.
 * Never use floating point for amounts — 0.1 + 0.2 !== 0.3, and rent ledgers must balance
 * to the cent.
 */
export type Minor = bigint;

export const DEFAULT_CURRENCY = 'KES';

/** "1234.5" | "1,234.50" | 1234.5 → 123450n. Rejects more than 2 decimal places. */
export function toMinor(major: string | number): Minor {
  const text = typeof major === 'number' ? major.toFixed(2) : major.replace(/,/g, '').trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`Not a valid amount: "${major}"`);
  const [, sign, whole, frac = ''] = match;
  const value = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return sign ? -value : value;
}

/** 123450n → "1234.50" (no grouping; formatting for people is a client concern). */
export function toMajorString(minor: Minor): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const text = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** Splits an amount by a percentage in basis points (1000 = 10%), rounding half up. */
export function percentOf(minor: Minor, basisPoints: number): Minor {
  if (!Number.isInteger(basisPoints)) throw new RangeError('basisPoints must be an integer');
  const product = minor * BigInt(basisPoints);
  const half = 5000n;
  return product >= 0n ? (product + half) / 10000n : -((-product + half) / 10000n);
}
