import { describe, expect, it } from 'vitest';
import { homeFor } from './lastPlace';
import { toSession } from './session';
import type { Place, SessionPayload } from './types';

/** Synthetic data only. */
const org = { id: 'org-1', name: 'Makini Homes', kind: 'HOST' as const, roleName: 'Owner', isOwner: true };
const activeOrg = { id: 'org-1', name: 'Makini Homes', kind: 'HOST' as const, status: 'ACTIVE' as const };
const tenant = { tenantId: 't-1', name: 'Test Person', organization: { id: 'org-2', name: 'Other Agency' } };
const owner = { landlordId: 'll-1', name: 'Test Landlord', organization: { id: 'org-2', name: 'Other Agency' } };

const payload = (over: Partial<SessionPayload> = {}, defaultPlace: Place | null = null): SessionPayload => ({
  user: {
    id: 'u-1',
    firstName: 'Test',
    lastName: 'Person',
    email: 'person@example.invalid',
    phone: '+254700000001',
    isPlatformAdmin: false,
    defaultPlace,
    defaultHomeId: null,
  },
  organizations: [org],
  activeOrganization: activeOrg,
  permissions: [],
  ...over,
});

describe('homeFor', () => {
  it('lands in the remembered place', () => {
    const everything = (defaultPlace: Place) =>
      toSession(
        payload(
          {
            user: {
              id: 'u-1',
              firstName: 'Test',
              lastName: 'Person',
              email: 'person@example.invalid',
              phone: '+254700000001',
              isPlatformAdmin: false,
              platformRole: 'SALESPERSON',
              defaultPlace,
              defaultHomeId: null,
            },
            tenantOf: [tenant],
            ownerOf: [owner],
          },
          defaultPlace,
        ),
      );

    expect(homeFor(everything('PLATFORM'))).toBe('/admin');
    expect(homeFor(everything('TENANT'))).toBe('/tenant');
    expect(homeFor(everything('OWNER'))).toBe('/owner');
    expect(homeFor(everything('STAFF'))).toBe('/app');
  });

  it('falls back when the place is gone', () => {
    // Demoted operator with defaultPlace PLATFORM -> staff app, not a 403 page
    expect(homeFor(toSession(payload({}, 'PLATFORM')))).toBe('/app');
    // Former tenant with defaultPlace TENANT but no tenantOf -> staff app
    expect(homeFor(toSession(payload({ tenantOf: [] }, 'TENANT')))).toBe('/app');
    // Former landlord with defaultPlace OWNER but no ownerOf -> staff app
    expect(homeFor(toSession(payload({ ownerOf: [] }, 'OWNER')))).toBe('/app');
    // Nothing remembered -> staff app when they have an org
    expect(homeFor(toSession(payload({}, null)))).toBe('/app');
    // Left their organisation (or no org) -> falls back via landingFor order
    expect(
      homeFor(
        toSession(
          payload(
            { organizations: [], activeOrganization: null, tenantOf: [tenant] },
            'STAFF',
          ),
        ),
      ),
    ).toBe('/tenant');
    expect(
      homeFor(
        toSession(
          payload(
            { organizations: [], activeOrganization: null, tenantOf: [tenant] },
            null,
          ),
        ),
      ),
    ).toBe('/tenant');
  });
});

describe('toSession invitations', () => {
  it('maps pending invitations and defaults missing ones to an empty list', () => {
    expect(toSession(payload()).invitations).toEqual([]);
    const invite = {
      membershipId: 'm-1',
      organization: { id: 'org-3', name: 'Kilimani Stays', kind: 'HOST' as const },
      roleName: 'Manager',
    };
    expect(toSession(payload({ invitations: [invite] })).invitations).toEqual([invite]);
  });
});
