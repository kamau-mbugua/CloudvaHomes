/** Permissions that move or redirect money: staff holding any need a second code (phase 26). */
export const MONEY_PERMISSIONS = [
  'payments:refund',
  'channels:manage',
  'remittances:approve',
  'remittances:pay',
  'stay-payments:refund',
  'reconciliation:update',
] as const;

export type StaffTwoFactorRule = 'OFF' | 'MONEY_ROLES' | 'ALL_STAFF';

/**
 * Whether signing in with a password needs a second code: some organisation the person works
 * for (actively) asks for it, for all staff or for roles that handle money.
 */
export function staffNeedsSecondCode(
  memberships: { rule: StaffTwoFactorRule; permissions: readonly string[] }[],
): boolean {
  return memberships.some(
    (m) =>
      m.rule === 'ALL_STAFF' ||
      (m.rule === 'MONEY_ROLES' &&
        m.permissions.some((p) => (MONEY_PERMISSIONS as readonly string[]).includes(p))),
  );
}
