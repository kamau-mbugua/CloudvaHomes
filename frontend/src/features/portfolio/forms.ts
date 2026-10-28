/** Turning text inputs into request values. */

/** Trimmed text, or undefined when empty — for optional fields in a request body. */
export function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Trimmed text, or null when empty — for clearing an optional field on PATCH. */
export function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** A whole number from a text input, or null when empty; NaN when it is not one. */
export function wholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}
