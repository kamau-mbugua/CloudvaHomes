import { describe, expect, it } from 'vitest';
import { belongsInOwnerPortal, pickOwnerProfile } from './owner';
import { toSession } from './session';
import type { OwnerOf, SessionPayload } from './types';

/** Synthetic data only. */

const owners: OwnerOf[] = [
  { landlordId: 'll-1', name: 'Test Landlord One', organization: { id: 'org-1', name: 'Sample Agency' } },
  { landlordId: 'll-2', name: 'Test Landlord Two', organization: { id: 'org-2', name: 'Other Agency' } },
];

const payload = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  user: { id: 'u-1', firstName: 'Test', lastName: 'Owner', email: null, phone: '+254700000001', isPlatformAdmin: false },
  organizations: [],
  activeOrganization: null,
  permissions: [],
  ...over,
});

describe('session ownerOf', () => {
  it('keeps ownerOf from the API and reads its absence as none', () => {
    expect(toSession(payload({ ownerOf: owners })).ownerOf).toEqual(owners);
    expect(toSession(payload()).ownerOf).toEqual([]);
  });
});

describe('belongsInOwnerPortal', () => {
  it('sends a landlord with no organisation to the portal', () => {
    expect(belongsInOwnerPortal(toSession(payload({ ownerOf: owners })))).toBe(true);
  });
  it('keeps staff in the org app, even when they are landlords too', () => {
    const staff = payload({
      ownerOf: owners,
      organizations: [{ id: 'org-1', name: 'Sample Agency', kind: 'AGENCY', roleName: 'Owner', isOwner: true }],
    });
    expect(belongsInOwnerPortal(toSession(staff))).toBe(false);
    expect(belongsInOwnerPortal(toSession({ ...staff, activeOrganization: { id: 'org-1', name: 'Sample Agency', kind: 'AGENCY' } }))).toBe(false);
  });
  it('leaves someone with nothing on the no-organisation page', () => {
    expect(belongsInOwnerPortal(toSession(payload()))).toBe(false);
  });
});

describe('pickOwnerProfile', () => {
  it('picks the asked-for profile only if it is theirs', () => {
    expect(pickOwnerProfile(owners, 'll-2')?.landlordId).toBe('ll-2');
    expect(pickOwnerProfile(owners, 'someone-else')?.landlordId).toBe('ll-1');
    expect(pickOwnerProfile(owners, null)?.landlordId).toBe('ll-1');
    expect(pickOwnerProfile([], 'll-1')).toBeNull();
  });
});
