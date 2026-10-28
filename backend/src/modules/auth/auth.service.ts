import { Injectable, Logger } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { authContext } from './decorators.js';
import { normalizePhone, parseIdentifier, passwordProblem } from './identifiers.js';
import { OTP_TTL_MINUTES, OtpService } from './otp.service.js';
import { type IssuedSession, SessionsService } from './sessions.service.js';
import { TokensService } from './tokens.service.js';

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

  async login(identifier: string, password: string): Promise<IssuedSession> {
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
    const user = await this.prisma.user.findUnique({
      where: id.kind === 'email' ? { email: id.value } : { phone: id.value },
    });
    const ok = await verifyPassword(user?.passwordHash, password);
    if (!user || !ok || user.status !== 'ACTIVE') throw invalid;

    await this.rateLimit.reset(`login:id:${id.value}`);
    const session = await this.sessions.start(user.id, null);
    await this.audit.record({
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      orgId: null,
      after: { method: 'password' },
    });
    return session;
  }

  /** Always resolves (202) — whether the number is registered is not disclosed. */
  async requestLoginOtp(phoneInput: string): Promise<void> {
    const phone = normalizePhone(phoneInput);
    if (!phone)
      throw AppError.fieldInvalid('phone', 'Enter a valid phone number, e.g. 0712 345 678');
    await this.rateLimit.hit(
      { key: `otp:phone:${phone}`, limit: 3, windowSeconds: 15 * MIN },
      { key: `otp:ip:${this.ip()}`, limit: 10, windowSeconds: HOUR },
    );
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || user.status !== 'ACTIVE') return;
    const code = await this.otp.issue(phone, 'LOGIN', user.id);
    await this.deliverCode({ phone }, 'login', code, OTP_TTL_MINUTES.LOGIN, { silent: true });
  }

  async verifyLoginOtp(phoneInput: string, code: string): Promise<IssuedSession> {
    const phone = normalizePhone(phoneInput);
    if (!phone)
      throw AppError.unauthenticated(
        'INVALID_CODE',
        'That code is wrong or has expired. Request a new one.',
      );
    await this.rateLimit.hit({
      key: `otp-verify:ip:${this.ip()}`,
      limit: 30,
      windowSeconds: 15 * MIN,
    });
    const userId = await this.otp.verify(phone, 'LOGIN', code);
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

  /** Always resolves (202). The code goes to whichever identifier the user typed. */
  async forgotPassword(identifier: string): Promise<void> {
    const id = parseIdentifier(identifier);
    if (!id) throw AppError.fieldInvalid('identifier', 'Enter your email address or phone number');
    await this.rateLimit.hit(
      { key: `reset:id:${id.value}`, limit: 3, windowSeconds: HOUR },
      { key: `reset:ip:${this.ip()}`, limit: 10, windowSeconds: HOUR },
    );
    const user = await this.prisma.user.findUnique({
      where: id.kind === 'email' ? { email: id.value } : { phone: id.value },
    });
    if (!user || user.status !== 'ACTIVE') return;
    const code = await this.otp.issue(id.value, 'PASSWORD_RESET', user.id);
    await this.deliverCode(
      id.kind === 'phone' ? { phone: id.value } : { email: id.value },
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
    const user = await this.prisma.user.findUnique({
      where: id.kind === 'email' ? { email: id.value } : { phone: id.value },
    });
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
    purpose: 'login' | 'reset' | 'step-up',
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
