/**
 * Express `json replacer`: money columns are BigInt (minor units), which JSON.stringify
 * cannot serialise. They go out as plain JSON integers. Anything beyond 2^53 cannot be
 * represented exactly by clients, so it is a bug, not a value to round.
 */
export function bigintJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== 'bigint') return value;
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`BigInt ${value} exceeds the JSON-safe integer range`);
  }
  return Number(value);
}
