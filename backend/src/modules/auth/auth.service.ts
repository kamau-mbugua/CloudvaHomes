import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { currentContext, withoutOrgScope } from '../../common/context/request-context.js';
import { parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { addDays, todayInNairobi } from '../billing/billing-math.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RolesService } from '../roles/roles.service.js';
import { DEFAULT_RULES } from '../stays/rules/terms.js';
import type { RegisterOrganizationDto } from './auth.dto.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { authContext } from './decorators.js';
import {
  type Identifier,
  normalizeEmail,
  normalizePhone,
  parseIdentifier,
  passwordProblem,
} from './identifiers.js';
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
    @Optional() @Inject(DB) private readonly db?: Db,
  ) {}

  /**
   * Public bootstrap configuration for web and mobile clients: maintenance status,
   * public signup policy, and server-evaluated mobile version check (`forceUpdateRequired`).
   */
  async appConfig(versionCode?: number) {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
    const minCode = settings?.minAppVersionCode ?? 1;
    const minName = settings?.minAppVersionName ?? '1.0.0';
    const allowPublicSignup = settings?.allowPublicSignup ?? false;
    const maintenanceMode = settings?.maintenanceMode ?? false;
    const forceUpdateRequired =
      versionCode !== undefined && Number.isFinite(versionCode) ? versionCode < minCode : false;

    let defaultPlan: {
      name: string;
      trialDays: number;
      pricePerUnit: bigint;
      minimumMonthly: bigint;
    } | null = null;

    if (allowPublicSignup) {
      const plan =
        (settings?.defaultPlanId
          ? await this.prisma.plan.findFirst({
              where: { id: settings.defaultPlanId, active: true },
            })
          : null) ??
        (await this.prisma.plan.findFirst({ where: { isDefault: true, active: true } }));
      if (plan) {
        defaultPlan = {
          name: plan.name,
          trialDays: plan.trialDays,
          pricePerUnit: plan.pricePerUnit,
          minimumMonthly: plan.minimumMonthly,
        };
      }
    }

    return {
      maintenanceMode,
      maintenanceMessage: settings?.maintenanceMessage ?? null,
      allowPublicSignup,
      minAppVersionCode: minCode,
      minAppVersionName: minName,
      appUpdateMessage: settings?.appUpdateMessage ?? null,
      appStoreUrl: settings?.appStoreUrl ?? null,
      forceUpdateRequired,
      defaultPlan,
    };
  }

  /**
   * Self-service organisation registration when `PlatformSettings.allowPublicSignup` is enabled.
   * Atomically creates the organisation, seeds system roles, creates/links the owner User,
   * and returns an authenticated session.
   */
  async registerOrganization(dto: RegisterOrganizationDto): Promise<IssuedSession> {
    await this.rateLimit.hit({
      key: `register:ip:${this.ip()}`,
      limit: 10,
      windowSeconds: HOUR,
    });

    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
    if (!settings?.allowPublicSignup) {
      throw new AppError(
        403,
        'SIGNUP_DISABLED',
        'Public organisation registration is currently disabled. Contact KodiHub to get started.',
      );
    }

    const phone = normalizePhone(dto.phone);
    if (!phone) {
      throw AppError.fieldInvalid('phone', 'Enter a valid phone number, e.g. 0712 345 678');
    }
    const email = normalizeEmail(dto.email);
    if (!email) {
      throw AppError.fieldInvalid('email', 'Enter a valid email address');
    }
    const problem = passwordProblem(dto.password, [email, phone]);
    if (problem) {
      throw AppError.fieldInvalid('password', problem);
    }

    const passwordHash = await hashPassword(dto.password);

    const runner = this.db ?? (this.prisma as unknown as Db);
    const { userId, orgId } = await withoutOrgScope(async () =>
      runner.$transaction(async (tx) => {
        const existingEmailUser = await tx.user.findUnique({ where: { email } });
        if (existingEmailUser) {
          throw AppError.fieldInvalid(
            'email',
            'An account with this email already exists. Sign in instead.',
          );
        }
        const existingPhoneUser = await tx.user.findUnique({ where: { phone } });
        if (existingPhoneUser) {
          throw AppError.fieldInvalid(
            'phone',
            'An account with this phone number already exists. Sign in instead.',
          );
        }

        const [{ n }] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval('"billing_ref_seq"') AS n`;

        const plan =
          (settings.defaultPlanId
            ? await tx.plan.findFirst({ where: { id: settings.defaultPlanId, active: true } })
            : null) ?? (await tx.plan.findFirst({ where: { isDefault: true, active: true } }));

        const trialEndsAt = plan ? addDays(parseDateOnly(todayInNairobi()), plan.trialDays) : null;

        const org = await tx.organization.create({
          data: {
            name: dto.organizationName.trim(),
            kind: dto.organizationKind ?? 'LANDLORD',
            phone,
            email,
            kraPin: dto.kraPin ? dto.kraPin.toUpperCase() : null,
            billingRef: `H${String(n).padStart(5, '0')}`,
            planId: plan?.id ?? null,
            trialEndsAt,
          },
        });

        const roles = await RolesService.seedSystemRoles(tx, org.id, org.kind);

        if (org.kind === 'HOST') {
          await tx.hostSite.create({
            data: {
              orgId: org.id,
              businessName: org.name,
              rules: DEFAULT_RULES as unknown as object,
              slug: null,
              published: false,
            },
          });
        }

        const user = await tx.user.create({
          data: {
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            email,
            phone,
            passwordHash,
          },
        });

        await tx.membership.create({
          data: {
            orgId: org.id,
            userId: user.id,
            roleId: roles.OWNER,
            propertyIds: [],
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });

        await this.audit.record(
          {
            action: 'organization.register',
            entity: 'organization',
            entityId: org.id,
            actorId: user.id,
            orgId: org.id,
            after: { name: org.name, kind: org.kind, billingRef: org.billingRef },
          },
          tx,
        );

        return { userId: user.id, orgId: org.id };
      }),
    );

    return this.sessions.start(userId, orgId);
  }

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
    const user = await this.findUserByIdentifier(id);
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
    const user = await this.findUserByIdentifier(id);
    if (!user || user.status !== 'ACTIVE') return;
    if (user.isPlatformAdmin || user.platformRole !== null) return;
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
    if (user.isPlatformAdmin || user.platformRole !== null) {
      throw AppError.forbidden(
        'OPERATOR_PASSWORD_REQUIRED',
        'Platform operators must sign in with a password.',
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
    const user = await this.findUserByIdentifier(id);
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
    const user = await this.findUserByIdentifier(id);
    if (!user) throw invalid;
    const problem = passwordProblem(newPassword, [user.email, user.phone]);
    if (problem) throw AppError.fieldInvalid('newPassword', problem);

    const userId = await this.otp.verify(id.value, 'PASSWORD_RESET', code);
    if (userId !== user.id) throw invalid;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
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
   * Resolves a global `User` strictly from the `users` table by normalized email or phone.
   * Never reads or links `tenant` records during authentication so unverified tenant contact
   * fields supplied by an organisation cannot be used to take over or mutate another user's account.
   */
  private findUserByIdentifier(id: Identifier) {
    return this.prisma.user.findUnique({
      where: id.kind === 'email' ? { email: id.value } : { phone: id.value },
    });
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
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
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
