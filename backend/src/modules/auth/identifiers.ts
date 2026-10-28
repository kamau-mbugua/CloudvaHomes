import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Kenyan formats (0712…, 712…, 254712…, +254 712 …) → "+254712345678"; other countries need "+". */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), 'KE');
  return parsed?.isValid() ? parsed.number : null;
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  // Deliberately loose: real validation is "the code/link we send arrives".
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

/** What the user typed in "Email or phone". */
export function parseIdentifier(input: string): Identifier | null {
  if (input.includes('@')) {
    const email = normalizeEmail(input);
    return email ? { kind: 'email', value: email } : null;
  }
  const phone = normalizePhone(input);
  return phone ? { kind: 'phone', value: phone } : null;
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Returns a reason the password is unacceptable, or null. Length beats complexity rules. */
export function passwordProblem(
  password: string,
  personal: (string | null | undefined)[] = [],
): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  if (/^\d+$/.test(password)) return "Don't use only numbers";
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character";
  const lower = password.toLowerCase();
  for (const p of personal) {
    if (p && p.length >= 4 && lower.includes(p.toLowerCase().replace(/^\+/, ''))) {
      return "Don't include your email or phone number";
    }
  }
  return null;
}
