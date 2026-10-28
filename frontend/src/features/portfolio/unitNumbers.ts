/**
 * Unit numbers for a bulk add: prefix + a numeric range → ["A1", "A2", …].
 *
 * Leading zeros in "from" set the width ("01"–"12" → A01…A12), so the numbers sort the way
 * people read them. The server takes at most 500 at once and rejects the whole batch on
 * any clash, so the preview is the place to catch mistakes.
 */

export const MAX_BULK_UNITS = 500;

export type UnitRange = { ok: true; numbers: string[] } | { ok: false; error: string };

export function buildUnitNumbers({ prefix, from, to }: { prefix: string; from: string; to: string }): UnitRange {
  const start = from.trim();
  const end = to.trim();
  const head = prefix.trim();

  if (!start || !end) return { ok: false, error: 'Enter the first and last number.' };
  if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) return { ok: false, error: 'From and to must be whole numbers.' };
  if (/\s/.test(head)) return { ok: false, error: 'The prefix cannot contain spaces.' };

  const first = Number(start);
  const last = Number(end);
  if (last < first) return { ok: false, error: '“To” must be the same as or after “From”.' };

  const count = last - first + 1;
  if (count > MAX_BULK_UNITS) {
    return { ok: false, error: `That is ${count} units; add at most ${MAX_BULK_UNITS} at a time.` };
  }

  const width = start.length > 1 && start.startsWith('0') ? Math.max(start.length, end.length) : 0;
  const numbers: string[] = [];
  for (let n = first; n <= last; n += 1) {
    numbers.push(`${head}${String(n).padStart(width, '0')}`);
  }
  return { ok: true, numbers };
}
