import type { Session, SessionUser, TenantOf } from './types';

export function isPlatformOperator(
  user?: Pick<SessionUser, 'isPlatformAdmin' | 'platformRole'> | null,
): boolean {
  return Boolean(user?.isPlatformAdmin || user?.platformRole);
}

export function isSuperAdmin(
  user?: Pick<SessionUser, 'isPlatformAdmin' | 'platformRole'> | null,
): boolean {
  return Boolean(user?.isPlatformAdmin || user?.platformRole === 'SUPERADMIN');
}

/**
 * The account-menu link back to the platform, for an operator who is also working in an
 * organisation: superadmins go back to "Platform admin", salespeople to their "Sales console".
 */
export function platformLinkLabel(
  user?: Pick<SessionUser, 'isPlatformAdmin' | 'platformRole'> | null,
): string | null {
  if (!isPlatformOperator(user)) return null;
  return isSuperAdmin(user) ? 'Platform admin' : 'Sales console';
}

/**
 * Where someone without an organisation of their own belongs. Staff land in the org app;
 * people who are only a landlord of an agency (`ownerOf`, phase 6b) or only a tenant
 * (`tenantOf`, phase 7) land in that portal; someone who is both is asked which.
 *
 * Someone with memberships but no active one is not sent anywhere: the "choose an
 * organisation" screen handles them (and links to their portals).
 */

export type Landing = '/admin' | '/owner' | '/tenant' | 'choose' | null;

type PortalSession = Pick<Session, 'activeOrganization' | 'organizations' | 'ownerOf'> & {
  tenantOf?: Session['tenantOf'];
  user?: Pick<Session['user'], 'isPlatformAdmin' | 'platformRole'>;
};

/**
 * Platform operators (phase 8 & 11) without an organisation of their own land in the admin area
 * (`/admin`); its account menu links to any portal they also have.
 */
export function landingFor(session: PortalSession): Landing {
  if (session.activeOrganization || session.organizations.length > 0) return null;
  if (isPlatformOperator(session.user)) return '/admin';
  const owner = (session.ownerOf?.length ?? 0) > 0;
  const tenant = (session.tenantOf?.length ?? 0) > 0;
  if (owner && tenant) return 'choose';
  if (owner) return '/owner';
  if (tenant) return '/tenant';
  return null;
}

/** The tenant account to show: the one asked for if it is theirs, else the first. */
export function pickTenantAccount(tenantOf: readonly TenantOf[], wanted: string | null | undefined): TenantOf | null {
  return tenantOf.find((t) => t.tenantId === wanted) ?? tenantOf[0] ?? null;
}

/** The portals a person can open, for the account menu and the portals' footers. */
export function portalsOf(session: Pick<Session, 'organizations' | 'ownerOf'> & { tenantOf?: Session['tenantOf'] }) {
  return {
    staff: session.organizations.length > 0,
    owner: (session.ownerOf?.length ?? 0) > 0,
    tenant: (session.tenantOf?.length ?? 0) > 0,
  };
}

/** Where an account menu is shown. */
export type MenuHere = 'staff' | 'owner' | 'tenant' | 'admin';

export type BackToTarget =
  | { label: string; to: '/app'; place: 'STAFF'; organizationId: string }
  | { label: string; to: '/tenant'; place: 'TENANT'; tenantId: string | null; homeId: string | null }
  | { label: string; to: string; place: 'OWNER'; landlordId: string };

type MenuSession = Pick<
  Session,
  'organizations' | 'ownerOf' | 'user' | 'activeOrganization' | 'activeTenantId' | 'activeLandlordId'
> & {
  tenantOf?: Session['tenantOf'];
};

function resolveBackTo(
  session: MenuSession,
  priorPlace?: 'STAFF' | 'TENANT' | 'OWNER' | null,
): BackToTarget | null {
  const orgTarget = (): BackToTarget | null => {
    const activeId = session.activeOrganization?.id ?? session.user.defaultOrgId ?? null;
    const org =
      (activeId ? session.organizations.find((o) => o.id === activeId) : undefined) ??
      session.organizations[0];
    if (!org) return null;
    return { label: `Back to ${org.name}`, to: '/app', place: 'STAFF', organizationId: org.id };
  };

  const tenantTarget = (): BackToTarget | null => {
    const accounts = session.tenantOf ?? [];
    if (accounts.length === 0) return null;
    const homes: { tenantId: string; homeId: string; name: string }[] = [];
    for (const acc of accounts) {
      for (const u of acc.units ?? []) {
        homes.push({
          tenantId: acc.tenantId,
          homeId: u.tenancyId,
          name: `${u.unitNumber}, ${u.propertyName}`,
        });
      }
    }
    if (homes.length > 0) {
      const matched = homes.find((h) => h.homeId === session.user.defaultHomeId);
      if (matched) {
        return {
          label: `Back to ${matched.name}`,
          to: '/tenant',
          place: 'TENANT',
          tenantId: matched.tenantId,
          homeId: matched.homeId,
        };
      }
      if (homes.length >= 2) {
        return { label: 'Back to All my homes', to: '/tenant', place: 'TENANT', tenantId: null, homeId: null };
      }
      return {
        label: `Back to ${homes[0].name}`,
        to: '/tenant',
        place: 'TENANT',
        tenantId: homes[0].tenantId,
        homeId: homes[0].homeId,
      };
    }
    const acc = pickTenantAccount(
      accounts,
      session.activeTenantId ?? session.user.defaultTenantId,
    )!;
    return {
      label: `Back to ${acc.organization.name}`,
      to: '/tenant',
      place: 'TENANT',
      tenantId: acc.tenantId,
      homeId: null,
    };
  };

  const ownerTarget = (): BackToTarget | null => {
    if (session.ownerOf.length === 0) return null;
    const wanted = session.activeLandlordId ?? session.user.defaultLandlordId;
    const owner = session.ownerOf.find((o) => o.landlordId === wanted) ?? session.ownerOf[0];
    return {
      label: `Back to ${owner.name}`,
      to: `/owner?landlord=${encodeURIComponent(owner.landlordId)}`,
      place: 'OWNER',
      landlordId: owner.landlordId,
    };
  };

  const place = priorPlace ?? session.user.defaultPlace;
  if (place === 'STAFF') return orgTarget() ?? tenantTarget() ?? ownerTarget();
  if (place === 'TENANT') return tenantTarget() ?? orgTarget() ?? ownerTarget();
  if (place === 'OWNER') return ownerTarget() ?? orgTarget() ?? tenantTarget();
  return orgTarget() ?? tenantTarget() ?? ownerTarget();
}

/**
 * What the profile menu offers:
 * - Outside the admin area: the sidebar/header switcher owns every organisation, home and
 *   landlord profile, so the profile menu only carries "Sales console" / "Platform admin"
 *   for operators.
 * - In the admin area (which has no switcher): "Back to <name>" plus the full grouped list.
 */
export function menuPlaces(
  session: MenuSession,
  here: MenuHere,
  priorPlace?: 'STAFF' | 'TENANT' | 'OWNER' | null,
): {
  organizations: 'none';
  staffApp: false;
  ownerPortal: false;
  tenantPortal: false;
  platform: string | null;
  backTo: BackToTarget | null;
  list: boolean;
} {
  if (here === 'admin') {
    return {
      organizations: 'none',
      staffApp: false,
      ownerPortal: false,
      tenantPortal: false,
      platform: null,
      backTo: resolveBackTo(session, priorPlace),
      list: true,
    };
  }
  return {
    organizations: 'none',
    staffApp: false,
    ownerPortal: false,
    tenantPortal: false,
    platform: platformLinkLabel(session.user),
    backTo: null,
    list: false,
  };
}
