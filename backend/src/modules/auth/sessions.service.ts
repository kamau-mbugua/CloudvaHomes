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
  };
  organizations: { id: string; name: string; kind: string; roleName: string; isOwner: boolean }[];
  activeOrganization: { id: string; name: string; kind: string; status: string } | null;
  permissions: string[];
  /** Landlords this user may see in the owner portal (phase 6b). */
  ownerOf: { landlordId: string; name: string; organization: { id: string; name: string } }[];
  /** Tenant accounts this user may see in the tenant portal (phase 7). */
  tenantOf: { tenantId: string; name: string; organization: { id: string; name: string } }[];
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
    const orgId = await this.pickOrg(userId, preferredOrgId);
    const familyId = randomUUID();
    const refreshToken = await this.storeRefresh(userId, familyId, orgId);
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return { payload: await this.build(userId, orgId, familyId), refreshToken };
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
    const orgId = await this.pickOrg(record.userId, record.orgId);
    const refreshToken = await this.storeRefresh(record.userId, record.familyId, orgId);
    return { payload: await this.build(record.userId, orgId, record.familyId), refreshToken };
  }

  /** Same session (family), different organisation. */
  async switchOrg(userId: string, sessionId: string, orgId: string): Promise<SessionPayload> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, orgId, status: 'ACTIVE' },
    });
    if (!membership) throw AppError.notFound('Organisation');
    // Remember the choice so the next refresh keeps the user in this organisation.
    await this.prisma.refreshToken.updateMany({
      where: { familyId: sessionId, revokedAt: null, usedAt: null },
      data: { orgId },
    });
    return this.build(userId, orgId, sessionId);
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
  async build(userId: string, orgId: string | null, sessionId: string): Promise<SessionPayload> {
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
    const landlords = await this.prisma.landlord.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        organization: { kind: 'AGENCY', status: { not: 'CLOSED' } },
      },
      select: { id: true, name: true, organization: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    const tenancies = await this.prisma.tenant.findMany({
      where: { userId, organization: { status: { not: 'CLOSED' } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const access = await this.tokens.signAccess({
      userId,
      orgId: active?.orgId ?? null,
      sessionId,
      isPlatformAdmin: user.isPlatformAdmin,
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
        isPlatformAdmin: user.isPlatformAdmin,
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
      permissions: active
        ? active.role.systemKey === 'OWNER'
          ? [...ALL_PERMISSIONS]
          : active.role.permissions.filter((p) => ALL_PERMISSIONS.includes(p))
        : [],
      ownerOf: landlords.map((l) => ({
        landlordId: l.id,
        name: l.name,
        organization: l.organization,
      })),
      tenantOf: tenancies.map((t) => ({
        tenantId: t.id,
        name: `${t.firstName} ${t.lastName}`,
        organization: t.organization,
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
  ): Promise<string> {
    const ctx = currentContext();
    const raw = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        orgId,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
        userAgent: ctx?.userAgent ?? null,
        ip: ctx?.ip ?? null,
      },
    });
    return raw;
  }
}
