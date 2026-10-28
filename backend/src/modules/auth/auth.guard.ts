import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { currentContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ALL_PERMISSIONS } from '../roles/permissions.js';
import {
  ALLOW_WHEN_SUSPENDED,
  ANY_PERMISSION,
  IS_PUBLIC,
  PLATFORM_ADMIN_ONLY,
  REQUIRED_PERMISSIONS,
  REQUIRES_ORG,
} from './decorators.js';
import { SessionsService } from './sessions.service.js';
import { TokensService } from './tokens.service.js';

export const STEP_UP_HEADER = 'x-step-up';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: authenticates every non-@Public route, loads the caller's membership and
 * permissions from the database (so removals and role changes apply immediately, not when the
 * token expires), then enforces @RequireOrg / @RequirePermission / @PlatformAdminOnly.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { id?: string }>();
    const ctx = currentContext();
    if (!ctx) throw new Error('Request context missing — is requestContextMiddleware mounted?');
    // pino-http assigns the request id after our middleware ran; pick it up here.
    ctx.requestId = typeof req.id === 'string' ? req.id : ctx.requestId;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const header = req.get('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!bearer) throw AppError.unauthenticated();
    const claims = await this.tokens.verifyAccess(bearer);

    const user = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, status: true, isPlatformAdmin: true },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await this.sessions.isSessionActive(claims.sessionId))
    ) {
      throw AppError.unauthenticated('SESSION_REVOKED', 'Please sign in again');
    }
    ctx.userId = user.id;
    ctx.sessionId = claims.sessionId;
    ctx.isPlatformAdmin = user.isPlatformAdmin;

    if (claims.orgId) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          userId: user.id,
          orgId: claims.orgId,
          status: 'ACTIVE',
          organization: { status: { not: 'CLOSED' } },
        },
        select: {
          propertyIds: true,
          role: { select: { systemKey: true, permissions: true } },
          organization: { select: { status: true } },
        },
      });
      if (membership) {
        ctx.orgId = claims.orgId;
        ctx.orgStatus = membership.organization.status;
        ctx.isOwner = membership.role.systemKey === 'OWNER';
        ctx.permissions = new Set(ctx.isOwner ? ALL_PERMISSIONS : membership.role.permissions);
        // Owners always see everything; an empty list means "all properties".
        ctx.propertyIds =
          ctx.isOwner || membership.propertyIds.length === 0 ? null : membership.propertyIds;
      }
    }

    const stepUp = req.get(STEP_UP_HEADER);
    if (stepUp) {
      ctx.stepUpVerified = await this.tokens.isValidStepUp(stepUp, user.id, claims.sessionId);
    }

    if (
      this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_ONLY, targets) &&
      !ctx.isPlatformAdmin
    ) {
      throw AppError.forbidden();
    }
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    const anyOf = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSION, targets) ?? [];
    const needsOrg =
      required.length > 0 ||
      anyOf.length > 0 ||
      this.reflector.getAllAndOverride<boolean>(REQUIRES_ORG, targets);
    if (needsOrg && !ctx.orgId) {
      throw AppError.forbidden('NO_ACTIVE_ORGANIZATION', 'Choose an organisation first');
    }
    if (required.some((p) => !ctx.permissions.has(p))) throw AppError.forbidden();
    if (
      ctx.orgStatus === 'SUSPENDED' &&
      !SAFE_METHODS.has(req.method) &&
      !ctx.isPlatformAdmin &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_SUSPENDED, targets)
    ) {
      throw AppError.forbidden(
        'ORG_SUSPENDED',
        'Your Hodi account is read-only until the Hodi bill is paid. Tenants can still pay rent.',
      );
    }
    if (anyOf.length && !anyOf.some((p) => ctx.permissions.has(p))) throw AppError.forbidden();
    return true;
  }
}
