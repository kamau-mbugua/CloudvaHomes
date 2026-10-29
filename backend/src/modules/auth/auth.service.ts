import { Injectable, Logger } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { authContext } from './decorators.js';
import { type Identifier, parseIdentifier, passwordProblem } from './identifiers.js';
import { OTP_TTL_MINUTES, OtpService } from './otp.service.js';
import { type IssuedSession, SessionsService } from './sessions.service.js';
import { TokensService } from './tokens.service.js';

export interface AdminTwoFactorChallenge {
  requiresTwoFactor: true;
  challengeToken: string;
  expiresAt: string;
  channel: 'EMAIL' | 'SMS';
  destinationMasked: string;
}

export type LoginResult =
  | { kind: 'session'; session: IssuedSession }
  | { kind: 'two_factor'; challenge: AdminTwoFactorChallenge };

function maskContact(value: string): string {
  if (value.includes('@')) {
    const [local = '', domain = ''] = value.split('@');
    const head = local.slice(0, 2);
    return `${head}${'•'.repeat(Math.max(2, local.length - 2))}@${domain}`;
  }
  return value.length > 6 ? `${value.slice(0, 6)}••••${value.slice(-2)}` : '••••';
}

const MIN = 60;
const HOUR = 3600;

/**
 * Sign-in flows. Rules that apply throughout:
 * - Responses never reveal whether an account exists (same error / always 202).
 * - Every guessable input is rate limited per subject AND per IP.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async login(identifier: string, password: string): Promise<LoginResult> {
    const invalid = AppError.unauthenticated(
      'INVALID_CREDENTIALS',
      'Wrong email/phone or password',
    );
    const id = parseIdentifier(identifier);
    await this.rateLimit.hit(
      {
        key: `login:id:${id?.value ?? identifier.trim().toLowerCase()}`,
        limit: 5,
        windowSeconds: 15 * MIN,
      },
      { key: `login:ip:${this.ip()}`, limit: 30, windowSeconds: 15 * MIN },
    );
    if (!id) {
      await verifyPassword(null, password);
      throw invalid;
    }
    const user = await this.resolveUserForAuth(id, { requireEmailIfUnlinkedTenant: true });
    const ok = await verifyPassword(user?.passwordHash, password);
    if (!user || !ok || user.status !== 'ACTIVE') throw invalid;

    await this.rateLimit.reset(`login:id:${id.value}`);

    const isOperator = user.isPlatformAdmin || user.platformRole !== null;
    if (isOperator) {
      const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
      if (settings?.requireAdminTwoFactor) {
        const preferSms = settings.adminTwoFactorChannel === 'SMS';
        const useSms = (preferSms && !!user.phone) || (!user.email && !!user.phone);
        const destination = useSms ? user.phone : user.email;
        if (!destination) {
          throw AppError.conflict(
            'Add an email address or phone number to this admin account before using 2FA',
            'NO_CONTACT',
          );
        }
        const code = await this.otp.issue(user.id, 'ADMIN_2FA', user.id);
        await this.deliverCode(
          useSms ? { phone: destination } : { email: destination },
          'admin-2fa',
          code,
          OTP_TTL_MINUTES.ADMIN_2FA,
        );
        const { token, expiresAt } = await this.tokens.signAdminTwoFactorChallenge(user.id);
        return {
          kind: 'two_factor',
          challenge: {
            requiresTwoFactor: true,
            challengeToken: token,
            expiresAt: expiresAt.toISOString(),
            channel: useSms ? 'SMS' : 'EMAIL',
            destinationMasked: maskContact(destination),
          },
        };
      }
    }

    const session = await this.sessions.start(user.id, null);
    await this.audit.record({
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      orgId: null,
      after: { method: 'password' },
    });
    return { kind: 'session', session };
  }

  async verifyAdminTwoFactor(challengeToken: string, code: string): Promise<IssuedSession> {
    await this.rateLimit.hit({
      key: `admin-2fa-verify:ip:${this.ip()}`,
      limit: 20,
      windowSeconds: 15 * MIN,
    });
    const userId = await this.tokens.verifyAdminTwoFactorChallenge(challengeToken);
    await this.otp.verify(userId, 'ADMIN_2FA', code);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE' || (!user.isPlatformAdmin && !user.platformRole)) {
      throw AppError.unauthenticated(
        'INVALID_CODE',
        'That code is wrong or has expired. Please sign in again.',
      );
    }
    const session = await this.sessions.start(user.id, null);
    await this.audit.record({
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      orgId: null,
      after: { method: 'password+2fa' },
    });
    return session;
  }

  /** Always resolves (202) — whether the email/number is registered is not disclosed. */
  async requestLoginOtp(identifierInput: string): Promise<void> {
    const id = parseIdentifier(identifierInput);
    if (!id) {
      throw AppError.fieldInvalid(
        'phone',
        'Enter a valid email address or phone number, e.g. you@example.com or 0712 345 678',
      );
    }
    await this.rateLimit.hit(
      { key: `otp:phone:${id.value}`, limit: 3, windowSeconds: 15 * MIN },
      { key: `otp:ip:${this.ip()}`, limit: 10, windowSeconds: HOUR },
    );
    const user = await this.resolveUserForAuth(id, { requireEmailIfUnlinkedTenant: true });
    if (!user || user.status !== 'ACTIVE') return;
    const code = await this.otp.issue(id.value, 'LOGIN', user.id);
    await this.deliverCode(
      id.kind === 'phone' ? { phone: id.value } : { email: id.value },
      'login',
      code,
      OTP_TTL_MINUTES.LOGIN,
      { silent: true },
    );
  }

  async verifyLoginOtp(identifierInput: string, code: string): Promise<IssuedSession> {
    const id = parseIdentifier(identifierInput);
    if (!id)
      throw AppError.unauthenticated(
        'INVALID_CODE',
        'That code is wrong or has expired. Request a new one.',
      );
    await this.rateLimit.hit({
      key: `otp-verify:ip:${this.ip()}`,
      limit: 30,
      windowSeconds: 15 * MIN,
    });
    const userId = await this.otp.verify(id.value, 'LOGIN', code);
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user || user.status !== 'ACTIVE') {
      throw AppError.unauthenticated(
        'INVALID_CODE',
        'That code is wrong or has expired. Request a new one.',
      );
    }
    const session = await this.sessions.start(user.id, null);
    await this.audit.record({
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      orgId: null,
      after: { method: 'otp' },
    });
    return session;
  }

  /** Always resolves (202). Sends the reset code to the user's email and/or phone. */
  async forgotPassword(identifier: string): Promise<void> {
    const id = parseIdentifier(identifier);
    if (!id) throw AppError.fieldInvalid('identifier', 'Enter your email address or phone number');
    await this.rateLimit.hit(
      { key: `reset:id:${id.value}`, limit: 3, windowSeconds: HOUR },
      { key: `reset:ip:${this.ip()}`, limit: 10, windowSeconds: HOUR },
    );
    const user = await this.resolveUserForAuth(id, { requireEmailIfUnlinkedTenant: false });
    if (!user || user.status !== 'ACTIVE') return;
    const code = await this.otp.issue(id.value, 'PASSWORD_RESET', user.id);
    await this.deliverCode(
      id.kind === 'phone' ? { phone: id.value, email: user.email } : { email: id.value },
      'reset',
      code,
      OTP_TTL_MINUTES.PASSWORD_RESET,
      { silent: true },
    );
  }

  async resetPassword(identifier: string, code: string, newPassword: string): Promise<void> {
    const id = parseIdentifier(identifier);
    const invalid = AppError.unauthenticated(
      'INVALID_CODE',
      'That code is wrong or has expired. Request a new one.',
    );
    if (!id) throw invalid;
    await this.rateLimit.hit({
      key: `reset-verify:ip:${this.ip()}`,
      limit: 30,
      windowSeconds: 15 * MIN,
    });
    const user = await this.resolveUserForAuth(id, { requireEmailIfUnlinkedTenant: false });
    if (!user) throw invalid;
    const problem = passwordProblem(newPassword, [user.email, user.phone]);
    if (problem) throw AppError.fieldInvalid('newPassword', problem);

    const userId = await this.otp.verify(id.value, 'PASSWORD_RESET', code);
    if (userId !== user.id) throw invalid;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.sessions.revokeAllForUser(user.id);
    await this.audit.record({
      action: 'auth.password_reset',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      orgId: null,
    });
  }

  /**
   * Resolves a global `User` by email or phone. If a tenant record already exists with that
   * email/phone (for example, onboarded before portal access was explicitly granted) or if the
   * user row is missing the tenant's email, provisions/updates the `User` and links the tenant.
   */
  private async resolveUserForAuth(
    id: Identifier,
    opts: { requireEmailIfUnlinkedTenant: boolean },
  ) {
    let user = await this.prisma.user.findUnique({
      where: id.kind === 'email' ? { email: id.value } : { phone: id.value },
    });

    if (id.kind === 'email') {
      if (!user) {
        const tenant = await this.prisma.tenant.findFirst({
          where: {
            email: { equals: id.value, mode: 'insensitive' },
            organization: { status: { not: 'CLOSED' } },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!tenant) return null;
        user = await this.prisma.user.findFirst({
          where: {
            OR: [
              ...(tenant.userId ? [{ id: tenant.userId }] : []),
              { phone: tenant.phone },
              { email: id.value },
            ],
          },
        });
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              phone: tenant.phone,
              email: id.value,
              firstName: tenant.firstName,
              lastName: tenant.lastName,
            },
          });
        } else if (!user.email) {
          const emailTaken = await this.prisma.user.count({
            where: { email: id.value, id: { not: user.id } },
          });
          if (!emailTaken) {
            user = await this.prisma.user.update({
              where: { id: user.id },
              data: { email: id.value },
            });
          }
        }
      }
      await this.prisma.tenant.updateMany({
        where: {
          userId: null,
          OR: [
            ...(user.phone ? [{ phone: user.phone }] : []),
            { email: { equals: id.value, mode: 'insensitive' } },
          ],
        },
        data: { userId: user.id, portalInvitedAt: new Date() },
      });
      return user;
    }

    // id.kind === 'phone'
    if (!user) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          phone: id.value,
          ...(opts.requireEmailIfUnlinkedTenant ? { email: { not: null } } : {}),
          organization: { status: { not: 'CLOSED' } },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!tenant) return null;
      const tenantEmail = tenant.email ? tenant.email.trim().toLowerCase() : null;
      if (tenantEmail) {
        user = await this.prisma.user.findUnique({ where: { email: tenantEmail } });
      }
      if (!user) {
        const emailFree = tenantEmail
          ? !(await this.prisma.user.count({ where: { email: tenantEmail } }))
          : false;
        user = await this.prisma.user.create({
          data: {
            phone: tenant.phone,
            email: emailFree ? tenantEmail : null,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
          },
        });
      } else if (!user.phone) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { phone: tenant.phone },
        });
      }
      await this.prisma.tenant.updateMany({
        where: { userId: null, phone: tenant.phone },
        data: { userId: user.id, portalInvitedAt: new Date() },
      });
      return user;
    }

    if (!user.email) {
      const tenantWithEmail = await this.prisma.tenant.findFirst({
        where: {
          phone: id.value,
          email: { not: null },
          organization: { status: { not: 'CLOSED' } },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (tenantWithEmail?.email) {
        const email = tenantWithEmail.email.trim().toLowerCase();
        const emailTaken = await this.prisma.user.count({
          where: { email, id: { not: user.id } },
        });
        if (!emailTaken) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { email },
          });
        }
      }
    }

    return user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const ctx = authContext();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    await this.rateLimit.hit({
      key: `password-change:user:${user.id}`,
      limit: 5,
      windowSeconds: 15 * MIN,
    });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw AppError.fieldInvalid('currentPassword', 'Your current password is wrong');
    }
    const problem = passwordProblem(newPassword, [user.email, user.phone]);
    if (problem) throw AppError.fieldInvalid('newPassword', problem);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.sessions.revokeAllForUser(user.id, ctx.sessionId);
    await this.audit.record({
      action: 'auth.password_change',
      entity: 'user',
      entityId: user.id,
      orgId: null,
    });
  }

  async requestStepUp(): Promise<void> {
    const ctx = authContext();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const target = user.phone ?? user.email;
    if (!target)
      throw AppError.conflict('Add a phone number or email to your account first', 'NO_CONTACT');
    await this.rateLimit.hit({ key: `step-up:user:${user.id}`, limit: 5, windowSeconds: 15 * MIN });
    const code = await this.otp.issue(target, 'STEP_UP', user.id);
    await this.deliverCode(
      user.phone ? { phone: user.phone } : { email: user.email },
      'step-up',
      code,
      OTP_TTL_MINUTES.STEP_UP,
    );
  }

  async verifyStepUp(code: string): Promise<{ stepUpToken: string; expiresAt: string }> {
    const ctx = authContext();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const target = user.phone ?? user.email;
    if (!target)
      throw AppError.unauthenticated(
        'INVALID_CODE',
        'That code is wrong or has expired. Request a new one.',
      );
    await this.otp.verify(target, 'STEP_UP', code);
    const { token, expiresAt } = await this.tokens.signStepUp(user.id, ctx.sessionId);
    return { stepUpToken: token, expiresAt: expiresAt.toISOString() };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) await this.sessions.revokeByRawToken(rawRefreshToken);
  }

  private ip(): string {
    return currentContext()?.ip ?? 'unknown';
  }

  private async deliverCode(
    to: { phone?: string | null; email?: string | null },
    purpose: 'login' | 'reset' | 'step-up' | 'admin-2fa',
    code: string,
    minutes: number,
    opts: { silent?: boolean } = {},
  ): Promise<void> {
    try {
      await this.notifications.sendCode(to, purpose, code, minutes);
    } catch (e) {
      this.logger.error({ err: e, purpose }, 'Code delivery failed');
      // On public endpoints an error here would reveal that the account exists, so the
      // caller still gets 202; operators see the failure in the logs.
      if (opts.silent) return;
      throw new AppError(
        502,
        'DELIVERY_FAILED',
        "We couldn't send the code. Please try again shortly.",
      );
    }
  }
}
