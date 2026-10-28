import {
  ALL_PERMISSIONS,
  isKnownPermission,
  PERMISSION_CATALOGUE,
  SYSTEM_ROLE_DEFAULTS,
} from './permissions.js';

describe('permission catalogue', () => {
  it('has unique resource:action keys', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const key of ALL_PERMISSIONS) expect(key).toMatch(/^[a-z-]+:[a-z]+$/);
    expect(PERMISSION_CATALOGUE.every((g) => g.permissions.length > 0)).toBe(true);
  });

  it('system role defaults only use known permissions', () => {
    for (const role of Object.values(SYSTEM_ROLE_DEFAULTS)) {
      expect(role.permissions.filter((p) => !isKnownPermission(p))).toEqual([]);
    }
  });

  it('keeps the dangerous permissions to the Owner (and Accountant for money)', () => {
    const manager = new Set<string>(SYSTEM_ROLE_DEFAULTS.MANAGER.permissions);
    for (const p of [
      'roles:update',
      'channels:manage',
      'remittances:approve',
      'remittances:pay',
      'payments:refund',
    ]) {
      expect(manager.has(p)).toBe(false);
    }
    const caretaker = new Set<string>(SYSTEM_ROLE_DEFAULTS.CARETAKER.permissions);
    expect([...caretaker].some((p) => /^(payments|invoices|channels|users|roles)/.test(p))).toBe(
      false,
    );
    // Maker–checker: the default accountant can pay remittances but not approve them.
    const accountant = new Set<string>(SYSTEM_ROLE_DEFAULTS.ACCOUNTANT.permissions);
    expect(accountant.has('remittances:pay')).toBe(true);
    expect(accountant.has('remittances:approve')).toBe(false);
  });

  it('Owner defaults to every permission', () => {
    expect([...SYSTEM_ROLE_DEFAULTS.OWNER.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});
