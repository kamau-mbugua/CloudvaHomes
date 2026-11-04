/**
 * List sorting kept in the URL as `?sort=<field>` or `?sort=-<field>` (descending) — the
 * same value the API accepts.
 */

/** Columns that start largest-first the first time they are clicked. */
export const DESC_FIRST: readonly string[] = ['balance', 'total', 'amount'];

export function parseSort(
  raw: string | null | undefined,
  allowed: readonly string[],
  fallback: string,
): { field: string; desc: boolean } {
  const read = (v: string) => (v.startsWith('-') ? { field: v.slice(1), desc: true } : { field: v, desc: false });
  const parsed = raw ? read(raw) : null;
  return parsed && allowed.includes(parsed.field) ? parsed : read(fallback);
}

/** The sort after clicking `field`'s header while the list is sorted by `current`. */
export function nextSort(current: string, field: string, descFirst: readonly string[] = DESC_FIRST): string {
  if (current === field) return `-${field}`;
  if (current === `-${field}`) return field;
  return descFirst.includes(field) ? `-${field}` : field;
}
