import { describe, expect, it } from 'vitest';
import { homeFor, parsePlace } from './lastPlace';
import { toSession } from './session';
import type { SessionPayload } from './types';

/** Synthetic data only. */
const payload = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  user: { id: 'u-1', firstName: 'Test', lastName: 'Person', email: null, phone: '+254700000001', isPlatformAdmin: false },
  organizations: [],
  activeOrganization: null,
  permissions: [],
  ...over,
});
const org = { id: 'org-1', name: 'Sample Homes', kind: 'HOST' as const, roleName: 'Owner', isOwner: true };
const salesperson = toSession(
  payload({
    user: { id: 'u-1', firstName: 'Test', lastName: 'Person', email: null, phone: '+254700000001', isPlatformAdmin: false, platformRole: 'SALESPERSON' },
    organizations: [org],
    activeOrganization: { id: 'org-1', name: 'Sample Homes', kind: 'HOST', status: 'ACTIVE' },
    tenantOf: [{ tenantId: 't-1', name: 'Test Person', organization: { id: 'org-2', name: 'Other Agency' } }],
  }),
);

describe('homeFor', () => {
  it('returns to the sales console when that is where the person was last', () => {
    expect(homeFor(salesperson, 'admin')).toBe('/admin');
    expect(homeFor(salesperson, 'tenant')).toBe('/tenant');
    expect(homeFor(salesperson, 'staff')).toBe('/app');
  });

  it('falls back to the staff app when nothing is remembered or the place is gone', () => {
    expect(homeFor(salesperson, null)).toBe('/app');
    expect(homeFor(salesperson, 'owner')).toBe('/app'); // not a landlord anywhere
    const staffOnly = toSession(payload({ organizations: [org] }));
    expect(homeFor(staffOnly, 'admin')).toBe('/app'); // no longer an operator
  });
});

describe('parsePlace', () => {
  it('accepts only the four places', () => {
    expect(parsePlace('admin')).toBe('admin');
    expect(parsePlace('elsewhere')).toBeNull();
    expect(parsePlace(null)).toBeNull();
  });
});
