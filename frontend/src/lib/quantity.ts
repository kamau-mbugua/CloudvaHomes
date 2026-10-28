/**
 * Meter readings and line quantities: decimals with up to three places, sent and received
 * as STRINGS ("120.500"). Never parsed into a float — they are held as a BigInt count of
 * thousandths, so `120.1 - 120.0` is exactly 0.100 and consumption × rate is exact.
 *
 * Mirrors the server's Decimal(14,3): at most 11 digits before the point.
 */

export type ParsedQuantity = { ok: true; milli: bigint } | { ok: false; error: string };

const PLAIN = /^(\d*)(?:\.(\d*))?$/;
const GROUPED = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d*))?$/;
const MAX_WHOLE_DIGITS = 11;

/** "120", "120.5", "1,204.250", ".5" → thousandths. Rejects negatives and a 4th decimal. */
export function parseQuantity(input: string): ParsedQuantity {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Enter a reading.' };
  if (text.startsWith('-')) return { ok: false, error: 'A reading cannot be negative.' };

  const match = GROUPED.exec(text) ?? PLAIN.exec(text);
  if (!match || (!match[1] && !match[2])) return { ok: false, error: 'Enter a number like 1204 or 1204.5.' };

  const fraction = match[2] ?? '';
  if (fraction.length > 3) return { ok: false, error: 'Use at most three decimal places.' };

  const whole = (match[1] ?? '').replace(/,/g, '').replace(/^0+(?=\d)/, '') || '0';
  if (whole.length > MAX_WHOLE_DIGITS) return { ok: false, error: 'That number is too large.' };

  return { ok: true, milli: BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')) };
}

/** Thousandths → the API's string form: 120500n → "120.500"; -100n → "-0.100". */
export function formatQuantity(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** "120.500" → "120.5"; "1.000" → "1" — for reading, not for sending. */
export function trimQuantity(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

/**
 * Consumption × unit rate (minor units per unit) in minor units, rounded half-up to the
 * cent: (milli × rate + 500) / 1000 in integers. Both inputs must be non-negative.
 */
export function meteredAmount(consumptionMilli: bigint, unitRate: number): number {
  if (consumptionMilli < 0n) throw new RangeError('Consumption cannot be negative.');
  if (!Number.isSafeInteger(unitRate) || unitRate < 0) throw new RangeError('The unit rate must be whole minor units.');
  const minor = (consumptionMilli * BigInt(unitRate) + 500n) / 1000n;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('That amount is too large.');
  return Number(minor);
}

export type ReadingCalc =
  | { state: 'empty' }
  | { state: 'invalid'; field: 'previous' | 'current'; error: string }
  | { state: 'ok'; consumption: string; amount: number | null };

/**
 * What one row of the readings sheet shows while someone types: consumption to three
 * decimals and its amount, or why it cannot be worked out. An empty `current` is not an
 * error — that meter simply has no reading this month. `unitRate` null = amount unknown.
 */
export function calculateReading(previous: string, current: string, unitRate: number | null): ReadingCalc {
  if (!current.trim()) return { state: 'empty' };

  const prev = parseQuantity(previous);
  if (!prev.ok) return { state: 'invalid', field: 'previous', error: prev.error };
  const curr = parseQuantity(current);
  if (!curr.ok) return { state: 'invalid', field: 'current', error: curr.error };
  if (curr.milli < prev.milli) {
    return { state: 'invalid', field: 'current', error: 'Lower than the previous reading.' };
  }

  const used = curr.milli - prev.milli;
  return {
    state: 'ok',
    consumption: formatQuantity(used),
    amount: unitRate === null ? null : meteredAmount(used, unitRate),
  };
}
