/**
 * `?sort=<field>` (ascending) or `?sort=-<field>` (descending) on list endpoints. Each DTO
 * validates against `sortValues(fields)`; services read it with `readSort`.
 */

/** Every accepted value: each field, then the same field with a leading minus. */
export function sortValues(fields: readonly string[]): string[] {
  return fields.flatMap((f) => [f, `-${f}`]);
}

export function readSort(
  raw: string | undefined,
  fallback: string,
): { field: string; desc: boolean } {
  const value = raw || fallback;
  return value.startsWith('-')
    ? { field: value.slice(1), desc: true }
    : { field: value, desc: false };
}
