import { normalizeAccountRef } from './daraja.js';

/** What an account reference could mean, in the order Hodi tries them (pure, no I/O). */
export type RefGuess =
  | { kind: 'tenant'; code: string }
  | { kind: 'invoice'; number: string }
  | { kind: 'unit'; ref: string };

export function guessesFor(raw: string | null | undefined): RefGuess[] {
  const ref = normalizeAccountRef(raw);
  if (!ref) return [];
  const out: RefGuess[] = [];
  if (/^T\d{3,}$/.test(ref)) out.push({ kind: 'tenant', code: ref });
  const inv = /^INV(\d{4})(\d{6,})$/.exec(ref);
  if (inv) out.push({ kind: 'invoice', number: `INV-${inv[1]}-${inv[2]}` });
  if (/^[A-Z0-9]{3,30}$/.test(ref)) out.push({ kind: 'unit', ref });
  return out;
}

/**
 * Unit references are property code + unit number ("KLC" + "A4" → "KLCA4"). Returns the
 * (propertyCode, unitNumber) splits worth looking up, longest code first.
 */
export function unitSplits(
  ref: string,
  propertyCodes: string[],
): { code: string; number: string }[] {
  return propertyCodes
    .filter((c) => ref.startsWith(c) && ref.length > c.length)
    .sort((a, b) => b.length - a.length)
    .map((code) => ({ code, number: ref.slice(code.length) }));
}

/**
 * The reference to match a bank credit on, from its free-text narrative: a tenant code
 * ("T00001") or an invoice number ("INV-2026-000001"/"INV2026000001") anywhere in it, or the
 * whole narrative when it is one token (a unit reference like "KLCA4"). Null otherwise: other
 * words ("RENT", "OCTOBER") must never auto-match.
 */
export function narrativeRef(narrative: string | null | undefined): string | null {
  const text = (narrative ?? '').toUpperCase();
  const tenant = /(?:^|[^A-Z0-9])(T\d{5,7})(?![A-Z0-9])/.exec(text);
  if (tenant) return tenant[1]!;
  const invoice = /(?:^|[^A-Z0-9])INV[-\s]?(\d{4})[-\s]?(\d{6,})(?![A-Z0-9])/.exec(text);
  if (invoice) return `INV${invoice[1]}${invoice[2]}`;
  const single = text.trim();
  return /^[A-Z0-9-]{3,30}$/.test(single) ? single : null;
}
