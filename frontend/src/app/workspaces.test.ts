import { describe, expect, it } from 'vitest';
import { toSession } from '../lib/auth/session';
import type { SessionPayload } from '../lib/auth/types';
import { countRows, currentWorkspace, filterRows, initials, workspaceList } from './workspaces';

/** Synthetic data only. */
const basePayload = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  user: {
    id: 'u-1',
    firstName: 'Grace',
    lastName: 'Wanjiku',
    email: 'grace@example.invalid',
    phone: '+254700000011',
    isPlatformAdmin: false,
    defaultPlace: null,
    defaultHomeId: null,
  },
  organizations: [],
  invitations: [],
  activeOrganization: null,
  permissions: [],
  ownerOf: [],
  tenantOf: [],
  ...over,
});

describe('initials', () => {
  it('builds up to two initials from a workspace name', () => {
    expect(initials('Makini Homes')).toBe('MH');
    expect(initials('KodiHub')).toBe('K');
    expect(initials('')).toBe('?');
  });
});

describe('workspaceList', () => {
  it('includes only groups that have rows', () => {
    const empty = toSession(basePayload());
    expect(workspaceList(empty, 'staff')).toEqual([]);

    const inviteOnly = toSession(
      basePayload({
        invitations: [
          {
            membershipId: 'inv-1',
            organization: { id: 'org-9', name: 'Kilimani Stays', kind: 'HOST' },
            roleName: 'Manager',
          },
        ],
      }),
    );
    expect(workspaceList(inviteOnly, 'staff').map((g) => g.label)).toEqual(['Organisations']);
  });

  it('formats organisation kinds, invited memberships, homes and landlord profiles with exact labels', () => {
    const session = toSession(
      basePayload({
        organizations: [
          { id: 'org-1', name: 'Makini Stays', kind: 'HOST', roleName: 'Owner', isOwner: true },
          { id: 'org-2', name: 'Rift Agency', kind: 'AGENCY', roleName: 'Manager', isOwner: false },
          { id: 'org-3', name: 'Wanjiku Courts', kind: 'LANDLORD', roleName: 'Accountant', isOwner: false },
        ],
        activeOrganization: { id: 'org-2', name: 'Rift Agency', kind: 'AGENCY', status: 'ACTIVE' },
        invitations: [
          {
            membershipId: 'm-inv-1',
            organization: { id: 'org-4', name: 'Savannah Homes', kind: 'LANDLORD' },
            roleName: 'Caretaker',
          },
        ],
        tenantOf: [
          {
            tenantId: 't-1',
            name: 'Grace Wanjiku',
            organization: { id: 'org-5', name: 'Ivory Breeze' },
            units: [{ tenancyId: 'ty-1', unitNumber: 'G1', propertyName: 'Acacia Heights' }],
          },
        ],
        ownerOf: [
          {
            landlordId: 'll-1',
            name: 'Grace Holdings',
            organization: { id: 'org-6', name: 'Peak Agency' },
          },
        ],
      }),
    );

    expect(workspaceList(session, 'staff')).toEqual([
      {
        label: 'Organisations',
        rows: [
          { kind: 'org', id: 'org-1', name: 'Makini Stays', detail: 'Short stays · Owner', current: false },
          { kind: 'org', id: 'org-2', name: 'Rift Agency', detail: 'Agency · Manager', current: true },
          { kind: 'org', id: 'org-3', name: 'Wanjiku Courts', detail: 'Landlord · Accountant', current: false },
          {
            kind: 'invited',
            membershipId: 'm-inv-1',
            orgId: 'org-4',
            name: 'Savannah Homes',
            detail: 'Landlord · Caretaker',
            roleName: 'Caretaker',
          },
        ],
      },
      {
        label: 'Homes I rent',
        rows: [
          {
            kind: 'home',
            tenantId: 't-1',
            homeId: 'ty-1',
            name: 'G1, Acacia Heights',
            detail: 'Tenant · Ivory Breeze',
            current: false,
          },
        ],
      },
      {
        label: 'Landlord of',
        rows: [
          {
            kind: 'landlord',
            landlordId: 'll-1',
            name: 'Grace Holdings',
            detail: 'Landlord · Peak Agency',
            current: false,
          },
        ],
      },
    ]);
  });

  it('adds "All my homes" only when the person rents 2 or more homes, and marks current per shell', () => {
    const twoHomes = (defaultHomeId: string | null) =>
      toSession(
        basePayload({
          user: {
            id: 'u-1',
            firstName: 'Grace',
            lastName: 'Wanjiku',
            email: 'grace@example.invalid',
            phone: '+254700000011',
            isPlatformAdmin: false,
            defaultPlace: 'TENANT',
            defaultHomeId,
          },
          activeLandlordId: 'll-2',
          tenantOf: [
            {
              tenantId: 't-1',
              name: 'Grace Wanjiku',
              organization: { id: 'org-5', name: 'Ivory Breeze' },
              units: [
                { tenancyId: 'ty-1', unitNumber: 'G1', propertyName: 'Acacia Heights' },
                { tenancyId: 'ty-2', unitNumber: 'B4', propertyName: 'Palm Gardens' },
              ],
            },
          ],
          ownerOf: [
            { landlordId: 'll-1', name: 'First Portfolio', organization: { id: 'org-6', name: 'Peak Agency' } },
            { landlordId: 'll-2', name: 'Second Portfolio', organization: { id: 'org-6', name: 'Peak Agency' } },
          ],
        }),
      );

    // No home chosen (or ended tenancy) -> all-homes is current in tenant shell
    const allChosen = workspaceList(twoHomes(null), 'tenant');
    expect(allChosen[0]).toEqual({
      label: 'Homes I rent',
      rows: [
        { kind: 'all-homes', name: 'All my homes', detail: 'Tenant · 2 homes', current: true },
        { kind: 'home', tenantId: 't-1', homeId: 'ty-1', name: 'G1, Acacia Heights', detail: 'Tenant · Ivory Breeze', current: false },
        { kind: 'home', tenantId: 't-1', homeId: 'ty-2', name: 'B4, Palm Gardens', detail: 'Tenant · Ivory Breeze', current: false },
      ],
    });

    // Specific home chosen -> that home is current
    const secondChosen = workspaceList(twoHomes('ty-2'), 'tenant');
    expect(secondChosen[0]?.rows.map((r) => ('current' in r ? r.current : false))).toEqual([false, false, true]);

    // Owner shell -> activeLandlordId is current, tenant rows are not current
    const inOwner = workspaceList(twoHomes('ty-2'), 'owner');
    expect(inOwner[0]?.rows.map((r) => ('current' in r ? r.current : false))).toEqual([false, false, false]);
    expect(inOwner[1]?.rows).toEqual([
      { kind: 'landlord', landlordId: 'll-1', name: 'First Portfolio', detail: 'Landlord · Peak Agency', current: false },
      { kind: 'landlord', landlordId: 'll-2', name: 'Second Portfolio', detail: 'Landlord · Peak Agency', current: true },
    ]);

    // Admin shell -> nothing in the switcher list is marked current
    const inAdmin = workspaceList(twoHomes('ty-2'), 'admin');
    expect(inAdmin.flatMap((g) => g.rows).some((r) => 'current' in r && r.current)).toBe(false);
  });
});

describe('currentWorkspace', () => {
  it('describes the closed trigger for staff, single home, all homes, and owner portal', () => {
    const session = toSession(
      basePayload({
        organizations: [{ id: 'org-1', name: 'Makini Homes', kind: 'HOST', roleName: 'Owner', isOwner: true }],
        activeOrganization: { id: 'org-1', name: 'Makini Homes', kind: 'HOST', status: 'ACTIVE' },
        activeLandlordId: 'll-1',
        tenantOf: [
          {
            tenantId: 't-1',
            name: 'Grace Wanjiku',
            organization: { id: 'org-5', name: 'Ivory Breeze' },
            units: [
              { tenancyId: 'ty-1', unitNumber: 'G1', propertyName: 'Acacia Heights' },
              { tenancyId: 'ty-2', unitNumber: 'B4', propertyName: 'Palm Gardens' },
            ],
          },
        ],
        ownerOf: [{ landlordId: 'll-1', name: 'Grace Holdings', organization: { id: 'org-6', name: 'Peak Agency' } }],
      }),
    );

    expect(currentWorkspace(session, 'staff')).toEqual({
      badge: 'MH',
      name: 'Makini Homes',
      detail: 'Short stays · Owner',
    });

    expect(currentWorkspace(session, 'tenant')).toEqual({
      badge: 'AH',
      name: 'All my homes (2)',
      detail: 'Tenant · Ivory Breeze',
    });

    const withOnePicked = {
      ...session,
      user: { ...session.user, defaultHomeId: 'ty-2' },
    };
    expect(currentWorkspace(withOnePicked, 'tenant')).toEqual({
      badge: 'BG',
      name: 'B4, Palm Gardens',
      detail: 'Tenant · Ivory Breeze',
    });

    expect(currentWorkspace(session, 'owner')).toEqual({
      badge: 'GH',
      name: 'Grace Holdings',
      detail: 'Landlord · Peak Agency',
    });
  });
});

describe('filterRows and countRows', () => {
  it('counts rows across groups and filters case-insensitively by name or detail, dropping empty groups', () => {
    const groups = workspaceList(
      toSession(
        basePayload({
          organizations: [
            { id: 'org-1', name: 'Makini Stays', kind: 'HOST', roleName: 'Owner', isOwner: true },
            { id: 'org-2', name: 'Rift Agency', kind: 'AGENCY', roleName: 'Manager', isOwner: false },
          ],
          invitations: [
            {
              membershipId: 'm-inv-1',
              organization: { id: 'org-4', name: 'Savannah Homes', kind: 'LANDLORD' },
              roleName: 'Caretaker',
            },
          ],
          tenantOf: [
            {
              tenantId: 't-1',
              name: 'Grace Wanjiku',
              organization: { id: 'org-5', name: 'Ivory Breeze' },
              units: [
                { tenancyId: 'ty-1', unitNumber: 'G1', propertyName: 'Acacia Heights' },
                { tenancyId: 'ty-2', unitNumber: 'B4', propertyName: 'Palm Gardens' },
              ],
            },
          ],
          ownerOf: [
            { landlordId: 'll-1', name: 'Grace Holdings', organization: { id: 'org-6', name: 'Peak Agency' } },
          ],
        }),
      ),
      'staff',
    );

    // 2 orgs + 1 invite + (All my homes + 2 homes) + 1 landlord = 7 rows (> 6 triggers search)
    expect(countRows(groups)).toBe(7);
    expect(filterRows(groups, '   ')).toEqual(groups);

    // Filter by name
    const byAcacia = filterRows(groups, 'acacia');
    expect(byAcacia).toEqual([
      {
        label: 'Homes I rent',
        rows: [
          {
            kind: 'home',
            tenantId: 't-1',
            homeId: 'ty-1',
            name: 'G1, Acacia Heights',
            detail: 'Tenant · Ivory Breeze',
            current: false,
          },
        ],
      },
    ]);

    // Filter by detail (role or kind)
    const byCaretaker = filterRows(groups, 'CARETAKER');
    expect(byCaretaker).toEqual([
      {
        label: 'Organisations',
        rows: [
          {
            kind: 'invited',
            membershipId: 'm-inv-1',
            orgId: 'org-4',
            name: 'Savannah Homes',
            detail: 'Landlord · Caretaker',
            roleName: 'Caretaker',
          },
        ],
      },
    ]);

    expect(filterRows(groups, 'nonexistent')).toEqual([]);
  });
});

