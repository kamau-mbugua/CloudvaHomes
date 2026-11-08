/** SMS bundle pricing. Money is in cents; M-Pesa takes whole shillings, so totals round up. */

export const MAX_BUNDLE_UNITS = 1_000_000;

export function bundleAmount(units: number, unitPrice: bigint): bigint {
  const cents = BigInt(units) * unitPrice;
  return ((cents + 99n) / 100n) * 100n;
}

export function effectiveUnitPrice(
  account: { unitPrice: bigint | null },
  settings: { smsUnitPrice: bigint },
): bigint {
  return account.unitPrice ?? settings.smsUnitPrice;
}

/** null when `units` can be bought. */
export function checkBundleUnits(units: number, min: number): string | null {
  if (!Number.isInteger(units)) return 'Enter a whole number of units';
  if (units < min) return `Buy at least ${min.toLocaleString('en-KE')} units`;
  if (units > MAX_BUNDLE_UNITS)
    return `Buy at most ${MAX_BUNDLE_UNITS.toLocaleString('en-KE')} units at a time`;
  return null;
}
