/**
 * The password rules, checked in the browser so a person learns them before submitting.
 * The server applies the same rules (and is the authority — its `VALIDATION_FAILED`
 * details are shown per field as well).
 *
 * At least 10 characters, and not only digits: a phone number or a PIN is not a password.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_RULES_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, not only numbers.`;

/** The first rule `password` breaks, as a sentence; null when it is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (/^\d+$/.test(password)) {
    return 'Use letters or symbols as well as numbers.';
  }
  return null;
}

/** Problems with a new password and its confirmation, keyed by field. Empty when fine. */
export function newPasswordErrors(
  password: string,
  confirm: string,
): Partial<Record<'password' | 'confirm', string>> {
  const errors: Partial<Record<'password' | 'confirm', string>> = {};
  const problem = passwordProblem(password);
  if (problem) errors.password = problem;
  if (confirm !== password) errors.confirm = 'The two passwords do not match.';
  return errors;
}

/** True for a 6-digit one-time code (spaces ignored). */
export function isOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ''));
}
