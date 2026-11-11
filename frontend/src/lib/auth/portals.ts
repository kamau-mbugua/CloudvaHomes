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

/**
 * What the account menu offers, wherever the person is — the one way between their places.
 *
 * - `organizations`: in a portal, every organisation is listed (each opens the staff app in
 *   it), so even someone in one organisation can get back to it; in the staff app and admin
 *   area, only when there is another to switch to.
 * - Links never point at the place the person is already in.
 * - `platform` names the link to the admin area for operators ("Sales console" for salespeople).
 */
export function menuPlaces(
  session: Pick<Session, 'organizations' | 'ownerOf' | 'user'> & { tenantOf?: Session['tenantOf'] },
  here: MenuHere,
): {
  organizations: 'none' | 'several' | 'all';
  staffApp: boolean;
  ownerPortal: boolean;
  tenantPortal: boolean;
  platform: string | null;
} {
  const places = portalsOf(session);
  const inPortal = here === 'owner' || here === 'tenant';
  const orgCount = session.organizations.length;
  return {
    organizations: orgCount === 0 ? 'none' : inPortal ? 'all' : 'several',
    staffApp: here === 'admin' && places.staff,
    ownerPortal: places.owner && here !== 'owner',
    tenantPortal: places.tenant && here !== 'tenant',
    platform: here === 'admin' ? null : platformLinkLabel(session.user),
  };
}
