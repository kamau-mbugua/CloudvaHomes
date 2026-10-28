import { Inject, Injectable } from '@nestjs/common';
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const STEP_UP_TTL_SECONDS = 5 * 60;
const ISSUER = 'hodi';
const AUDIENCE = 'hodi-api';

export interface AccessClaims {
  userId: string;
  orgId: string | null;
  sessionId: string;
  isPlatformAdmin: boolean;
}

/** Short-lived JWTs (HS256). Refresh tokens are opaque and live in RefreshTokenService. */
@Injectable()
export class TokensService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  async signAccess(c: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000);
    const token = await new SignJWT({
      typ: 'access',
      org: c.orgId,
      sid: c.sessionId,
      pa: c.isPlatformAdmin,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(c.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  /** Throws 401 TOKEN_EXPIRED (client should refresh) or 401 UNAUTHENTICATED. */
  async verifyAccess(token: string): Promise<AccessClaims> {
    const payload = await this.verify(token, 'access');
    return {
      userId: payload.sub!,
      orgId: typeof payload.org === 'string' ? payload.org : null,
      sessionId: String(payload.sid),
      isPlatformAdmin: payload.pa === true,
    };
  }

  async signStepUp(userId: string, sessionId: string): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + STEP_UP_TTL_SECONDS * 1000);
    const token = await new SignJWT({ typ: 'step_up', sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  /** True only for an unexpired step-up token issued to this user in this session. */
  async isValidStepUp(token: string, userId: string, sessionId: string): Promise<boolean> {
    try {
      const payload = await this.verify(token, 'step_up');
      return payload.sub === userId && payload.sid === sessionId;
    } catch {
      return false;
    }
  }

  private async verify(token: string, typ: string) {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (payload.typ !== typ || !payload.sub) throw new Error('wrong token type');
      return payload;
    } catch (e) {
      if (e instanceof joseErrors.JWTExpired) {
        throw AppError.unauthenticated('TOKEN_EXPIRED', 'Your session needs refreshing');
      }
      throw AppError.unauthenticated();
    }
  }
}
