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
  // Like a salesperson who owns a host organisation and rents a home somewhere.
  const salesTenant = toSession(
    payload({
      user: { id: 'u-1', firstName: 'Test', lastName: 'Person', email: null, phone: '+254700000001', isPlatformAdmin: false, platformRole: 'SALESPERSON' },
      organizations: [membership],
      activeOrganization: { id: 'org-1', name: 'Sample Agency', kind: 'AGENCY', status: 'ACTIVE' },
      tenantOf: tenants,
    }),
  );

  it('from the tenant portal: every organisation, the sales console, never the tenant portal itself', () => {
    expect(menuPlaces(salesTenant, 'tenant')).toEqual({
      organizations: 'all',
      staffApp: false,
      ownerPortal: false,
      tenantPortal: false,
      platform: 'Sales console',
    });
  });

  it('from the staff app: the switcher only when there is somewhere else to go', () => {
    expect(menuPlaces(salesTenant, 'staff')).toEqual({
      organizations: 'several',
      staffApp: false,
      ownerPortal: false,
      tenantPortal: true,
      platform: 'Sales console',
    });
  });

  it('from the admin area: the staff app and portals, never a link to the admin area itself', () => {
    expect(menuPlaces(salesTenant, 'admin')).toMatchObject({ staffApp: true, tenantPortal: true, platform: null });
  });

  it('a plain tenant sees no organisations and no platform', () => {
    expect(menuPlaces(toSession(payload({ tenantOf: tenants })), 'tenant')).toEqual({
      organizations: 'none',
      staffApp: false,
      ownerPortal: false,
      tenantPortal: false,
      platform: null,
    });
  });
});
