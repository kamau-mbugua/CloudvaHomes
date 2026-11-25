import { fromMilli, toMilli } from '../billing-math.js';

export type QuantityValue = string | { toFixed(n: number): string };

function asMilli(v: QuantityValue): bigint {
  return toMilli(typeof v === 'string' ? v : v.toFixed(3));
}

/**
 * Mean `current - previous` of a meter's readings before the period (newest first, at most 6),
 * rounded down to whole milli-units, or `null` when fewer than 2 readings exist.
 */
export function averageUse(
  readings: readonly { previous: QuantityValue; current: QuantityValue }[],
): string | null {
  const window = readings.slice(0, 6);
  if (window.length < 2) return null;
  let sum = 0n;
  for (const r of window) {
    sum += asMilli(r.current) - asMilli(r.previous);
  }
  return fromMilli(sum / BigInt(window.length));
}
