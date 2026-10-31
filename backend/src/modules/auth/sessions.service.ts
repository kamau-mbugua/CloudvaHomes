import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { currentContext } from '../../common/context/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ALL_PERMISSIONS } from '../roles/permissions.js';
import { randomToken, sha256 } from './crypto.js';
import { TokensService } from './tokens.service.js';

export const REFRESH_TTL_DAYS = 30;
/**
 * Two browser tabs can refresh at the same moment with the same token. Within this window a
 * second use of a just-rotated token is treated as that race (it gets its own new token)
 * rather than as theft.
 */
export const REUSE_GRACE_MS = 30_000;

export type Client = 'web' | 'mobile';

export interface SessionPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    isPlatformAdmin: boolean;
    platformRole: 'SUPERADMIN' | 'SALESPERSON' | null;
    defaultOrgId: string | null;
    defaultPropertyId: string | null;
    defaultTenantId: string | null;
    defaultLandlordId: string | null;
  };
  organizations: { id: string; name: string; kind: string; roleName: string; isOwner: boolean }[];
  activeOrganization: { id: string; name: string; kind: string; status: string } | null;
  activePropertyId: string | null;
  properties: {
    id: string;
    code: string;
    name: string;
    unitCount: number;
    occupiedCount: number;
  }[];
  activeTenantId: string | null;
  activeLandlordId: string | null;
  permissions: string[];
  /** Landlords this user may see in the owner portal (phase 6b). */
  ownerOf: {
    landlordId: string;
    name: string;
    organization: { id: string; name: string };
    properties: { id: string; code: string; name: string }[];
  }[];
  /** Tenant accounts this user may see in the tenant portal (phase 7). */
  tenantOf: {
    tenantId: string;
    name: string;
    organization: { id: string; name: string };
    units: {
      tenancyId: string;
      unitId: string;
      unitNumber: string;
      propertyId: string;
      propertyName: string;
    }[];
  }[];
}

export interface SessionScopeInput {
  propertyId?: string | null;
  tenantId?: string | null;
  landlordId?: string | null;
}

export interface IssuedSession {
  payload: SessionPayload;
  /** Raw refresh token — the controller puts it in a cookie (web) or the body (mobile). */
  refreshToken: string;
}

export type RefreshOutcome = 'ok' | 'reuse-grace';

/**
 * Refresh tokens are opaque, stored hashed, grouped in a "family" per sign-in and rotated on
 * every use. A rotated token presented again (outside the grace window) means it leaked: the
 * whole family is revoked and the user must sign in again.
 *
 * NB: identity tables (users, refresh tokens, memberships when listing a user's orgs) are read
 * across organisations here on purpose, so this uses the unscoped PrismaService.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  /** New sign-in → new family. */
  async start(userId: string, preferredOrgId: string | null): Promise<IssuedSession> {
    const userDefaults = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultOrgId: true,
        defaultPropertyId: true,
        defaultTenantId: true,
        defaultLandlordId: true,
      },
    });
    const orgId = await this.pickOrg(userId, preferredOrgId ?? userDefaults?.defaultOrgId ?? null);
    const scope: SessionScopeInput = {
      propertyId: userDefaults?.defaultPropertyId ?? null,
      tenantId: userDefaults?.defaultTenantId ?? null,
      landlordId: userDefaults?.defaultLandlordId ?? null,
    };
    const familyId = randomUUID();
    const refreshToken = await this.storeRefresh(userId, familyId, orgId, scope);
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return { payload: await this.build(userId, orgId, familyId, scope), refreshToken };
  }

  /** Rotates a refresh token. Throws 401 SESSION_REVOKED / SESSION_EXPIRED. */
  async refresh(raw: string): Promise<IssuedSession> {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!record || record.revokedAt) {
      throw AppError.unauthenticated('SESSION_REVOKED', 'Please sign in again');
    }
    if (record.expiresAt <= new Date()) {
      throw AppError.unauthenticated(
        'SESSION_EXPIRED',
        'Your session has expired. Please sign in again',
      );
    }

    // Claim the token atomically so two concurrent refreshes can't both "first-use" it.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      const latest = await this.prisma.refreshToken.findUniqueOrThrow({ where: { id: record.id } });
      const withinGrace = latest.usedAt && Date.now() - latest.usedAt.getTime() < REUSE_GRACE_MS;
      if (latest.revokedAt || !withinGrace) {
        await this.revokeFamily(record.familyId);
        await this.audit.record({
          action: 'session.reuse_detected',
          entity: 'session',
          entityId: record.familyId,
          actorId: record.userId,
          orgId: null,
        });
        throw AppError.unauthenticated('SESSION_REVOKED', 'Please sign in again');
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.status !== 'ACTIVE') {
      await this.revokeFamily(record.familyId);
      throw AppError.unauthenticated('SESSION_REVOKED', 'Please sign in again');
    }
    const orgId = await this.pickOrg(record.userId, record.orgId ?? user.defaultOrgId);
    const scope: SessionScopeInput = {
      propertyId: record.propertyId ?? user.defaultPropertyId ?? null,
      tenantId: record.tenantId ?? user.defaultTenantId ?? null,
      landlordId: record.landlordId ?? user.defaultLandlordId ?? null,
    };
    const refreshToken = await this.storeRefresh(record.userId, record.familyId, orgId, scope);
    return {
      payload: await this.build(record.userId, orgId, record.familyId, scope),
      refreshToken,
    };
  }

  /** Same session (family), different organisation (and optional property). */
  async switchOrg(
    userId: string,
    sessionId: string,
    orgId: string,
    propertyId?: string | null,
    setAsDefault = true,
  ): Promise<SessionPayload> {
    return this.switchContext(userId, sessionId, orgId, {
      organizationId: orgId,
      propertyId: propertyId ?? null,
      setAsDefault,
    });
  }

  /**
   * Switches active organisation, property, tenant account, or landlord account (or resets to
   * null for consolidated mode), rotates the JWT access token claims, and optionally persists
   * the selection as the user's default.
   */
  async switchContext(
    userId: string,
    sessionId: string,
    currentOrgId: string | null,
    opts: {
      organizationId?: string;
      propertyId?: string | null;
      tenantId?: string | null;
      landlordId?: string | null;
      setAsDefault?: boolean;
    },
  ): Promise<SessionPayload> {
    const liveToken = await this.prisma.refreshToken.findFirst({
      where: { familyId: sessionId, revokedAt: null, usedAt: null },
      select: { orgId: true, propertyId: true, tenantId: true, landlordId: true },
    });

    let targetOrgId = opts.organizationId ?? currentOrgId ?? liveToken?.orgId ?? null;
    if (opts.organizationId) {
      const membership = await this.prisma.membership.findFirst({
        where: { userId, orgId: opts.organizationId, status: 'ACTIVE' },
      });
      if (!membership) throw AppError.notFound('Organisation');
      targetOrgId = opts.organizationId;
    }

    let targetPropertyId =
      opts.propertyId !== undefined
        ? opts.propertyId
        : opts.organizationId && opts.organizationId !== currentOrgId
          ? null
          : (liveToken?.propertyId ?? null);

    if (targetPropertyId) {
      const prop = await this.prisma.property.findFirst({
        where: {
          id: targetPropertyId,
          ...(targetOrgId ? { orgId: targetOrgId } : {}),
        },
        select: { id: true, orgId: true },
      });
      if (!prop) throw AppError.notFound('Property');
      const m = await this.prisma.membership.findFirst({
        where: { userId, orgId: prop.orgId, status: 'ACTIVE' },
        include: { role: true },
      });
      if (m) {
        const isOwner = m.role.systemKey === 'OWNER';
        if (!isOwner && m.propertyIds.length > 0 && !m.propertyIds.includes(prop.id)) {
          throw AppError.notFound('Property');
        }
        targetOrgId = prop.orgId;
      }
    }

    const targetTenantId =
      opts.tenantId !== undefined ? opts.tenantId : (liveToken?.tenantId ?? null);
    if (targetTenantId) {
      const t = await this.prisma.tenant.findFirst({
        where: { id: targetTenantId, userId, organization: { status: { not: 'CLOSED' } } },
        select: { id: true },
      });
      if (!t) throw AppError.notFound('Account');
    }

    const targetLandlordId =
      opts.landlordId !== undefined ? opts.landlordId : (liveToken?.landlordId ?? null);
    if (targetLandlordId) {
      const l = await this.prisma.landlord.findFirst({
        where: {
          id: targetLandlordId,
          userId,
          status: 'ACTIVE',
          organization: { kind: 'AGENCY', status: { not: 'CLOSED' } },
        },
        select: { id: true },
      });
      if (!l) throw AppError.notFound('Landlord');
    }

    await this.prisma.refreshToken.updateMany({
      where: { familyId: sessionId, revokedAt: null, usedAt: null },
      data: {
        orgId: targetOrgId,
        propertyId: targetPropertyId,
        tenantId: targetTenantId,
        landlordId: targetLandlordId,
      },
    });

    if (opts.setAsDefault !== false) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(opts.organizationId !== undefined ? { defaultOrgId: targetOrgId } : {}),
          ...(opts.propertyId !== undefined ? { defaultPropertyId: targetPropertyId } : {}),
          ...(opts.tenantId !== undefined ? { defaultTenantId: targetTenantId } : {}),
          ...(opts.landlordId !== undefined ? { defaultLandlordId: targetLandlordId } : {}),
        },
      });
    }

    return this.build(userId, targetOrgId, sessionId, {
      propertyId: targetPropertyId,
      tenantId: targetTenantId,
      landlordId: targetLandlordId,
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** E.g. after a password change: sign out everywhere (optionally except the current session). */
  async revokeAllForUser(userId: string, exceptFamilyId?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByRawToken(raw: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (record) await this.revokeFamily(record.familyId);
  }

  async isSessionActive(familyId: string): Promise<boolean> {
    const live = await this.prisma.refreshToken.findFirst({
      where: { familyId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return live !== null;
  }

  /** The session object without tokens (GET /me) or with a new access token. */
  async build(
    userId: string,
    orgId: string | null,
    sessionId: string,
    scope?: SessionScopeInput,
  ): Promise<SessionPayload> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE', organization: { status: { not: 'CLOSED' } } },
          include: { organization: true, role: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const active = user.memberships.find((m) => m.orgId === orgId) ?? null;

    // Resolve accessible properties in the active organisation
    let properties: {
      id: string;
      code: string;
      name: string;
      unitCount: number;
      occupiedCount: number;
    }[] = [];
    if (active) {
      const isOwner = active.role.systemKey === 'OWNER';
      const limitIds = !isOwner && active.propertyIds.length > 0 ? active.propertyIds : null;
      const propRows = await this.prisma.property.findMany({
        where: {
          orgId: active.orgId,
          status: 'ACTIVE',
          ...(limitIds ? { id: { in: limitIds } } : {}),
        },
        select: {
          id: true,
          code: true,
          name: true,
          units: {
            select: {
              id: true,
              tenancies: {
                where: { status: { in: ['ACTIVE', 'NOTICE'] } },
                select: { id: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
      properties = propRows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        unitCount: p.units.length,
        occupiedCount: p.units.filter((u) => u.tenancies.length > 0).length,
      }));
    }

    const liveToken =
      scope === undefined
        ? await this.prisma.refreshToken.findFirst({
            where: { familyId: sessionId, revokedAt: null, usedAt: null },
            select: { propertyId: true, tenantId: true, landlordId: true },
          })
        : null;

    const wantedPropertyId =
      scope !== undefined
        ? scope.propertyId
        : (liveToken?.propertyId ?? user.defaultPropertyId ?? null);
    const activePropertyId =
      wantedPropertyId && properties.some((p) => p.id === wantedPropertyId)
        ? wantedPropertyId
        : null;

    const landlords = await this.prisma.landlord.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        organization: { kind: 'AGENCY', status: { not: 'CLOSED' } },
      },
      select: {
        id: true,
        name: true,
        organization: { select: { id: true, name: true } },
        properties: {
          where: { status: 'ACTIVE' },
          select: { id: true, code: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    // Auto-link any unlinked Tenant records matching this user's phone or email (e.g. a team member who is also a tenant).
    const tenantOr: { phone?: string; email?: { equals: string; mode: 'insensitive' } }[] = [];
    if (user.phone) tenantOr.push({ phone: user.phone });
    if (user.email) tenantOr.push({ email: { equals: user.email, mode: 'insensitive' } });
    if (tenantOr.length > 0) {
      await this.prisma.tenant.updateMany({
        where: { userId: null, OR: tenantOr },
        data: { userId, portalInvitedAt: new Date() },
      });
    }

    const tenancies = await this.prisma.tenant.findMany({
      where: { userId, organization: { status: { not: 'CLOSED' } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        organization: { select: { id: true, name: true } },
        tenancies: {
          where: { status: { not: 'ENDED' } },
          select: {
            id: true,
            unit: {
              select: {
                id: true,
                number: true,
                property: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { startDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const wantedTenantId =
      scope !== undefined ? scope.tenantId : (liveToken?.tenantId ?? user.defaultTenantId ?? null);
    const activeTenantId =
      wantedTenantId && tenancies.some((t) => t.id === wantedTenantId) ? wantedTenantId : null;

    const wantedLandlordId =
      scope !== undefined
        ? scope.landlordId
        : (liveToken?.landlordId ?? user.defaultLandlordId ?? null);
    const activeLandlordId =
      wantedLandlordId && landlords.some((l) => l.id === wantedLandlordId)
        ? wantedLandlordId
        : null;

    const platformRole = user.platformRole ?? (user.isPlatformAdmin ? 'SUPERADMIN' : null);
    const isPlatformAdmin = platformRole === 'SUPERADMIN';
    const access = await this.tokens.signAccess({
      userId,
      orgId: active?.orgId ?? null,
      propertyId: activePropertyId,
      tenantId: activeTenantId,
      landlordId: activeLandlordId,
      sessionId,
      isPlatformAdmin,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        isPlatformAdmin,
        platformRole,
        defaultOrgId: user.defaultOrgId ?? null,
        defaultPropertyId: user.defaultPropertyId ?? null,
        defaultTenantId: user.defaultTenantId ?? null,
        defaultLandlordId: user.defaultLandlordId ?? null,
      },
      organizations: user.memberships.map((m) => ({
        id: m.orgId,
        name: m.organization.name,
        kind: m.organization.kind,
        roleName: m.role.name,
        isOwner: m.role.systemKey === 'OWNER',
      })),
      activeOrganization: active
        ? {
            id: active.orgId,
            name: active.organization.name,
            kind: active.organization.kind,
            status: active.organization.status,
          }
        : null,
      activePropertyId,
      properties,
      activeTenantId,
      activeLandlordId,
      permissions: active
        ? active.role.systemKey === 'OWNER'
          ? [...ALL_PERMISSIONS]
          : active.role.permissions.filter((p) => ALL_PERMISSIONS.includes(p))
        : [],
      ownerOf: landlords.map((l) => ({
        landlordId: l.id,
        name: l.name,
        organization: l.organization,
        properties: l.properties,
      })),
      tenantOf: tenancies.map((t) => ({
        tenantId: t.id,
        name: `${t.firstName} ${t.lastName}`,
        organization: t.organization,
        units: t.tenancies.map((tc) => ({
          tenancyId: tc.id,
          unitId: tc.unit.id,
          unitNumber: tc.unit.number,
          propertyId: tc.unit.property.id,
          propertyName: tc.unit.property.name,
        })),
      })),
    };
  }

  private async pickOrg(userId: string, preferred: string | null): Promise<string | null> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE', organization: { status: { not: 'CLOSED' } } },
      orderBy: { createdAt: 'asc' },
      select: { orgId: true },
    });
    if (preferred && memberships.some((m) => m.orgId === preferred)) return preferred;
    return memberships[0]?.orgId ?? null;
  }

  private async storeRefresh(
    userId: string,
    familyId: string,
    orgId: string | null,
    scope?: SessionScopeInput,
  ): Promise<string> {
    const ctx = currentContext();
    const raw = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        orgId,
        propertyId: scope?.propertyId ?? null,
        tenantId: scope?.tenantId ?? null,
        landlordId: scope?.landlordId ?? null,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
        userAgent: ctx?.userAgent ?? null,
        ip: ctx?.ip ?? null,
      },
    });
    return raw;
  }
}
