/** Pure checks for the KodiHub admin SMS forms (provider settings, organisation SMS). */

export function adjustProblem(units: number, balance: number, reason: string): string | null {
  if (!Number.isInteger(units) || units === 0) return 'Enter a whole number of units other than 0';
  if (balance + units < 0) return `This would take the balance below zero (${balance} units left).`;
  if (reason.trim().length < 3) return 'Give a reason';
  return null;
}

export function parseBundles(
  text: string,
  minUnits: number,
): { ok: true; bundles: number[] } | { ok: false; error: string } {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, error: 'Give at least one bundle' };
  if (parts.some((p) => !/^\d+$/.test(p))) {
    return { ok: false, error: 'Separate bundles with commas, e.g. 500, 1000, 5000' };
  }
  const bundles = parts.map(Number);
  if (bundles.length > 6) return { ok: false, error: 'At most 6 bundles' };
  if (bundles.some((b) => b < minUnits)) return { ok: false, error: `Every bundle needs at least ${minUnits} units` };
  return { ok: true, bundles };
}
