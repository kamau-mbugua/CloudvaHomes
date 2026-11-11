import { describe, expect, it } from 'vitest';
import { landingFor, menuPlaces, pickTenantAccount, platformLinkLabel, portalsOf } from './portals';
import { toSession } from './session';
import type { OwnerOf, SessionPayload, TenantOf } from './types';

/** Synthetic data only. */

const owners: OwnerOf[] = [{ landlordId: 'll-1', name: 'Test Landlord', organization: { id: 'org-1', name: 'Sample Agency' } }];
const tenants: TenantOf[] = [
  { tenantId: 't-1', name: 'Test Tenant', organization: { id: 'org-1', name: 'Sample Agency' } },
  { tenantId: 't-2', name: 'Test Tenant', organization: { id: 'org-2', name: 'Other Agency' } },
];
const membership = { id: 'org-1', name: 'Sample Agency', kind: 'AGENCY' as const, roleName: 'Owner', isOwner: true };

const payload = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  user: { id: 'u-1', firstName: 'Test', lastName: 'Person', email: null, phone: '+254700000001', isPlatformAdmin: false },
  organizations: [],
  activeOrganization: null,
  permissions: [],
  ...over,
});

describe('session tenantOf', () => {
  it('keeps tenantOf from the API and reads its absence as none', () => {
    expect(toSession(payload({ tenantOf: tenants })).tenantOf).toEqual(tenants);
    expect(toSession(payload()).tenantOf).toEqual([]);
  });
});

describe('landingFor', () => {
  it('sends a tenant with nothing else to the tenant portal', () => {
    expect(landingFor(toSession(payload({ tenantOf: tenants })))).toBe('/tenant');
  });
  it('sends a landlord with nothing else to the owner portal', () => {
    expect(landingFor(toSession(payload({ ownerOf: owners })))).toBe('/owner');
  });
  it('asks someone who is both', () => {
    expect(landingFor(toSession(payload({ ownerOf: owners, tenantOf: tenants })))).toBe('choose');
  });
  it('keeps staff in the org app whatever else they are', () => {
    expect(landingFor(toSession(payload({ tenantOf: tenants, organizations: [membership] })))).toBeNull();
    expect(landingFor(toSession(payload({ tenantOf: tenants, organizations: [membership], activeOrganization: { id: 'org-1', name: 'Sample Agency', kind: 'AGENCY' } })))).toBeNull();
  });
  it('leaves someone with nothing on the no-organisation page', () => {
    expect(landingFor(toSession(payload()))).toBeNull();
  });
});

describe('pickTenantAccount', () => {
  it('picks the asked-for account only if it is theirs', () => {
    expect(pickTenantAccount(tenants, 't-2')?.tenantId).toBe('t-2');
    expect(pickTenantAccount(tenants, 'someone-else')?.tenantId).toBe('t-1');
    expect(pickTenantAccount(tenants, null)?.tenantId).toBe('t-1');
    expect(pickTenantAccount([], 't-1')).toBeNull();
  });
});

describe('portalsOf', () => {
  it('lists every place the person can open', () => {
    expect(portalsOf(toSession(payload({ ownerOf: owners, tenantOf: tenants, organizations: [membership] })))).toEqual({ staff: true, owner: true, tenant: true });
    expect(portalsOf(toSession(payload({ tenantOf: tenants })))).toEqual({ staff: false, owner: false, tenant: true });
  });
});

describe('platformLinkLabel', () => {
  it('names the way back to the platform after the operator role', () => {
    expect(platformLinkLabel({ isPlatformAdmin: false, platformRole: 'SALESPERSON' })).toBe('Sales console');
    expect(platformLinkLabel({ isPlatformAdmin: true, platformRole: 'SUPERADMIN' })).toBe('Platform admin');
    expect(platformLinkLabel({ isPlatformAdmin: false, platformRole: null })).toBeNull();
  });
});

describe('menuPlaces', () => {
  // Like a salesperson who owns a host organisation and rents two homes somewhere.
  const tenantWithHomes: TenantOf[] = [
    {
      tenantId: 't-1',
      name: 'Test Person',
      organization: { id: 'org-2', name: 'Ivory Breeze' },
      units: [
        { tenancyId: 'ty-1', unitNumber: 'G1', propertyName: 'Acacia Heights' },
        { tenancyId: 'ty-2', unitNumber: 'B4', propertyName: 'Palm Gardens' },
      ],
    },
  ];

  const salesTenant = toSession(
    payload({
      user: {
        id: 'u-1',
        firstName: 'Test',
        lastName: 'Person',
        email: 'person@example.invalid',
        phone: '+254700000001',
        isPlatformAdmin: false,
        platformRole: 'SALESPERSON',
        defaultPlace: 'PLATFORM',
        defaultHomeId: null,
      },
      organizations: [membership],
      activeOrganization: { id: 'org-1', name: 'Sample Agency', kind: 'AGENCY', status: 'ACTIVE' },
      tenantOf: tenantWithHomes,
      ownerOf: owners,
    }),
  );

  it('outside the admin area: hides organisations and portal links (the switcher owns those) and keeps only platform', () => {
    for (const here of ['staff', 'tenant', 'owner'] as const) {
      expect(menuPlaces(salesTenant, here)).toEqual({
        organizations: 'none',
        staffApp: false,
        ownerPortal: false,
        tenantPortal: false,
        platform: 'Sales console',
        backTo: null,
        list: false,
      });
    }

    expect(menuPlaces(toSession(payload({ tenantOf: tenants })), 'tenant')).toEqual({
      organizations: 'none',
      staffApp: false,
      ownerPortal: false,
      tenantPortal: false,
      platform: null,
      backTo: null,
      list: false,
    });
  });

  it('in the admin area: offers "Back to <name>" for the remembered place (with first-available fallback) and enables the full list', () => {
    // Fallback when defaultPlace is PLATFORM -> active/first org
    expect(menuPlaces(salesTenant, 'admin')).toEqual({
      organizations: 'none',
      staffApp: false,
      ownerPortal: false,
      tenantPortal: false,
      platform: null,
      backTo: {
        label: 'Back to Sample Agency',
        to: '/app',
        place: 'STAFF',
        organizationId: 'org-1',
      },
      list: true,
    });

    // Remembered specific home
    const rememberedHome = toSession(
      payload({
        user: {
          ...salesTenant.user,
          defaultPlace: 'TENANT',
          defaultHomeId: 'ty-2',
        },
        organizations: [membership],
        activeOrganization: { id: 'org-1', name: 'Sample Agency', kind: 'AGENCY', status: 'ACTIVE' },
        tenantOf: tenantWithHomes,
      }),
    );
    expect(menuPlaces(rememberedHome, 'admin').backTo).toEqual({
      label: 'Back to B4, Palm Gardens',
      to: '/tenant',
      place: 'TENANT',
      tenantId: 't-1',
      homeId: 'ty-2',
    });

    // Remembered landlord
    const rememberedOwner = toSession(
      payload({
        user: {
          ...salesTenant.user,
          defaultPlace: 'OWNER',
        },
        organizations: [membership],
        ownerOf: owners,
      }),
    );
    expect(menuPlaces(rememberedOwner, 'admin').backTo).toEqual({
      label: 'Back to Test Landlord',
      to: '/owner?landlord=ll-1',
      place: 'OWNER',
      landlordId: 'll-1',
    });

    // Pure superadmin with no other places -> backTo is null, list is true
    const pureOperator = toSession(
      payload({
        user: {
          id: 'u-admin',
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@example.invalid',
          phone: null,
          isPlatformAdmin: true,
          platformRole: 'SUPERADMIN',
        },
      }),
    );
    expect(menuPlaces(pureOperator, 'admin')).toMatchObject({
      platform: null,
      backTo: null,
      list: true,
    });

    // Entering /admin from /tenant (after setPlace('PLATFORM') sets defaultPlace='PLATFORM')
    // still names the place the operator just left ("Back to All my homes").
    expect(menuPlaces(salesTenant, 'admin', 'TENANT').backTo).toEqual({
      label: 'Back to All my homes',
      to: '/tenant',
      place: 'TENANT',
      tenantId: null,
      homeId: null,
    });
  });
});
