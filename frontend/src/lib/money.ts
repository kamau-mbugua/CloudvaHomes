/**
 * Money arrives from the API as integer minor units (cents) — never floats. Formatting
 * works on the integer directly, so no amount is ever rounded through a binary fraction.
 *
 * Grouping is done by hand rather than with Intl so the output is identical on every
 * browser and in tests, whatever locale the machine is set to.
 */

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

/** 123456 → "KES 1,234.56"; -5000 → "-KES 50.00". Throws on a non-integer. */
export function formatKES(minor: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`formatKES expects integer minor units, got ${minor}`);
  }

  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString().replace(GROUP, ',');
  const cents = (abs % 100).toString().padStart(2, '0');

  return `${negative ? '-' : ''}KES ${whole}.${cents}`;
}

export type ParsedAmount = { ok: true; minor: number } | { ok: false; error: string };

// "25000", "25,000", "25000.5", "25,000.50", ".50" — commas only in proper groups of three.
const PLAIN = /^(\d*)(?:\.(\d*))?$/;
const GROUPED = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d*))?$/;

/**
 * A typed amount in shillings → integer minor units, without passing through a float.
 *
 * Accepts thousands separators in their proper places and an optional "KES" in front.
 * Rejects negatives, more than two decimals and anything else — a rent of "25,00" is a
 * typo to point out, not a guess to make.
 */
export function parseAmount(input: string): ParsedAmount {
  const text = input.trim().replace(/^kes\s*/i, '');
  if (!text) return { ok: false, error: 'Enter an amount.' };
  if (text.startsWith('-')) return { ok: false, error: 'The amount cannot be negative.' };

  const match = GROUPED.exec(text) ?? PLAIN.exec(text);
  if (!match || (!match[1] && !match[2])) {
    return { ok: false, error: 'Enter an amount like 25,000 or 25000.50.' };
  }

  const fraction = match[2] ?? '';
  if (fraction.length > 2) return { ok: false, error: 'Use at most two decimal places.' };

  const whole = (match[1] ?? '').replace(/,/g, '') || '0';
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'That amount is too large.' };

  return { ok: true, minor };
}

/** Minor units → what goes back in an amount input: 2500000 → "25,000"; 2500050 → "25,000.50". */
export function minorToInput(minor: number): string {
  const formatted = formatKES(minor).replace('KES ', '');
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
}
