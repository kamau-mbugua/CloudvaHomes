import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import type { OtpPurpose } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashCode, randomCode, safeEqualHex } from './crypto.js';

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MINUTES: Record<OtpPurpose, number> = {
  LOGIN: 5,
  STEP_UP: 5,
  PASSWORD_RESET: 15,
};

/**
 * One-time codes. Only the newest unused code for a target+purpose is valid — requesting a new
 * code invalidates the previous one. Each code allows 5 attempts and one successful use.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Creates a code and returns it for delivery. Never return it to the HTTP client. */
  async issue(target: string, purpose: OtpPurpose, userId: string | null): Promise<string> {
    const code = randomCode();
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { target, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          target,
          purpose,
          userId,
          codeHash: hashCode(this.env.JWT_SECRET, code, `${purpose}:${target}`),
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES[purpose] * 60_000),
        },
      }),
    ]);
    return code;
  }

  /** Consumes the code if correct; otherwise throws 401 INVALID_CODE. Returns the code's userId. */
  async verify(target: string, purpose: OtpPurpose, code: string): Promise<string | null> {
    const invalid = () =>
      AppError.unauthenticated(
        'INVALID_CODE',
        'That code is wrong or has expired. Request a new one.',
      );
    if (!/^\d{6}$/.test(code)) throw invalid();

    const otp = await this.prisma.otpCode.findFirst({
      where: { target, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw invalid();

    // Count the attempt before comparing so parallel guesses can't exceed the limit.
    const counted = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, usedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
      throw invalid();
    }

    const expected = hashCode(this.env.JWT_SECRET, code, `${purpose}:${target}`);
    if (!safeEqualHex(expected, otp.codeHash)) throw invalid();

    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw invalid(); // used by a concurrent request
    return otp.userId;
  }
}
