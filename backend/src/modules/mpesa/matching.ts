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
