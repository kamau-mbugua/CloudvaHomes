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
