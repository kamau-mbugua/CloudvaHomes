import { pickOwnerProfile } from '../lib/auth/owner';
import type { MenuHere } from '../lib/auth/portals';
import type { OrgKind, Session } from '../lib/auth/types';
import { initials } from '../lib/text';

export { initials };

export type WorkspaceRow =
  | { kind: 'org'; id: string; name: string; detail: string; current: boolean }
  | { kind: 'invited'; membershipId: string; orgId: string; name: string; detail: string; roleName: string }
  | { kind: 'home'; tenantId: string; homeId: string; name: string; detail: string; current: boolean }
  | { kind: 'all-homes'; name: string; detail: string; current: boolean }
  | { kind: 'landlord'; landlordId: string; name: string; detail: string; current: boolean };

export type PendingInvite = Extract<WorkspaceRow, { kind: 'invited' }>;

export function rowKey(row: WorkspaceRow): string {
  switch (row.kind) {
    case 'org':
      return `org:${row.id}`;
    case 'invited':
      return `invited:${row.membershipId}`;
    case 'home':
      return `home:${row.homeId}`;
    case 'all-homes':
      return 'all-homes';
    case 'landlord':
      return `landlord:${row.landlordId}`;
  }
}

export type WorkspaceGroup = {
  label: 'Organisations' | 'Homes I rent' | 'Landlord of';
  rows: WorkspaceRow[];
};

export function orgKindLabel(kind: OrgKind | string): string {
  if (kind === 'LANDLORD') return 'Landlord';
  if (kind === 'AGENCY') return 'Agency';
  if (kind === 'HOST') return 'Short stays';
  return kind;
}

interface FlattenedHome {
  tenantId: string;
  homeId: string;
  name: string;
  detail: string;
  orgName: string;
}

function flattenedHomes(session: Session): FlattenedHome[] {
  const homes: FlattenedHome[] = [];
  for (const account of session.tenantOf) {
    for (const unit of account.units ?? []) {
      homes.push({
        tenantId: account.tenantId,
        homeId: unit.tenancyId,
        name: `${unit.unitNumber}, ${unit.propertyName}`,
        detail: `Tenant · ${account.organization.name}`,
        orgName: account.organization.name,
      });
    }
  }
  return homes;
}

export function workspaceList(session: Session, here: MenuHere): WorkspaceGroup[] {
  const groups: WorkspaceGroup[] = [];

  const orgRows: WorkspaceRow[] = [
    ...session.organizations.map(
      (org): WorkspaceRow => ({
        kind: 'org',
        id: org.id,
        name: org.name,
        detail: `${orgKindLabel(org.kind)} · ${org.roleName}`,
        current: here === 'staff' && session.activeOrganization?.id === org.id,
      }),
    ),
    ...session.invitations.map(
      (inv): WorkspaceRow => ({
        kind: 'invited',
        membershipId: inv.membershipId,
        orgId: inv.organization.id,
        name: inv.organization.name,
        detail: `${orgKindLabel(inv.organization.kind)} · ${inv.roleName}`,
        roleName: inv.roleName,
      }),
    ),
  ];
  if (orgRows.length > 0) {
    groups.push({ label: 'Organisations', rows: orgRows });
  }

  const homes = flattenedHomes(session);
  const homeRows: WorkspaceRow[] = [];
  if (homes.length >= 2) {
    const chosenHome = homes.find((h) => h.homeId === session.user.defaultHomeId) ?? null;
    homeRows.push({
      kind: 'all-homes',
      name: 'All my homes',
      detail: `Tenant · ${homes.length} homes`,
      current: here === 'tenant' && chosenHome === null,
    });
    for (const h of homes) {
      homeRows.push({
        kind: 'home',
        tenantId: h.tenantId,
        homeId: h.homeId,
        name: h.name,
        detail: h.detail,
        current: here === 'tenant' && chosenHome?.homeId === h.homeId,
      });
    }
  } else if (homes.length === 1) {
    const h = homes[0];
    homeRows.push({
      kind: 'home',
      tenantId: h.tenantId,
      homeId: h.homeId,
      name: h.name,
      detail: h.detail,
      current: here === 'tenant',
    });
  } else if (session.tenantOf.length > 0) {
    const orgName = session.tenantOf[0].organization.name;
    homeRows.push({
      kind: 'all-homes',
      name: orgName,
      detail: `Tenant · ${orgName}`,
      current: here === 'tenant',
    });
  }
  if (homeRows.length > 0) {
    groups.push({ label: 'Homes I rent', rows: homeRows });
  }

  const chosenLandlordId =
    pickOwnerProfile(session.ownerOf, session.activeLandlordId ?? session.user.defaultLandlordId)
      ?.landlordId ?? null;
  const landlordRows: WorkspaceRow[] = session.ownerOf.map((owner) => ({
    kind: 'landlord',
    landlordId: owner.landlordId,
    name: owner.name,
    detail: `Landlord · ${owner.organization.name}`,
    current: here === 'owner' && chosenLandlordId === owner.landlordId,
  }));
  if (landlordRows.length > 0) {
    groups.push({ label: 'Landlord of', rows: landlordRows });
  }

  return groups;
}

export function currentWorkspace(
  session: Session,
  here: MenuHere,
): { badge: string; name: string; detail: string } {
  if (here === 'staff') {
    const org = session.activeOrganization;
    const membership = session.organizations.find((m) => m.id === org?.id);
    const name = org?.name ?? 'KodiHub';
    const detail = membership
      ? `${orgKindLabel(membership.kind)} · ${membership.roleName}`
      : org
        ? orgKindLabel(org.kind)
        : '';
    return { badge: initials(name), name, detail };
  }

  if (here === 'tenant') {
    const homes = flattenedHomes(session);
    if (homes.length >= 2) {
      const chosen = homes.find((h) => h.homeId === session.user.defaultHomeId);
      if (chosen) {
        return { badge: initials(chosen.name), name: chosen.name, detail: chosen.detail };
      }
      const orgNames = [...new Set(homes.map((h) => h.orgName))];
      const detail = orgNames.length === 1 ? `Tenant · ${orgNames[0]}` : `Tenant · ${homes.length} homes`;
      return { badge: initials('All my homes'), name: `All my homes (${homes.length})`, detail };
    }
    if (homes.length === 1) {
      return { badge: initials(homes[0].name), name: homes[0].name, detail: homes[0].detail };
    }
    const orgName = session.tenantOf[0]?.organization.name;
    const name = orgName ?? 'My home';
    return { badge: initials(name), name, detail: orgName ? `Tenant · ${orgName}` : 'Tenant' };
  }

  if (here === 'owner') {
    const owner = pickOwnerProfile(
      session.ownerOf,
      session.activeLandlordId ?? session.user.defaultLandlordId,
    );
    const name = owner?.name ?? 'Owner portal';
    const detail = owner ? `Landlord · ${owner.organization.name}` : 'Landlord';
    return { badge: initials(name), name, detail };
  }

  const name = 'KodiHub admin';
  const detail =
    session.user.isPlatformAdmin || session.user.platformRole === 'SUPERADMIN'
      ? 'Platform admin'
      : 'Sales console';
  return { badge: initials(name), name, detail };
}

export function countRows(groups: readonly WorkspaceGroup[]): number {
  return groups.reduce((sum, group) => sum + group.rows.length, 0);
}

export function filterRows(groups: readonly WorkspaceGroup[], query: string): WorkspaceGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...groups];
  const filtered: WorkspaceGroup[] = [];
  for (const group of groups) {
    const rows = group.rows.filter(
      (row) => row.name.toLowerCase().includes(q) || row.detail.toLowerCase().includes(q),
    );
    if (rows.length > 0) {
      filtered.push({ label: group.label, rows });
    }
  }
  return filtered;
}

