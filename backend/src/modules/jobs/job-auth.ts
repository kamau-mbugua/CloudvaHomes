import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

/** Checks a Google-signed OIDC ID token (what Cloud Scheduler sends). Swappable in tests. */
@Injectable()
export class JobTokenVerifier {
  private readonly jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  /** Resolves to the caller's service-account email, or throws. */
  async verify(token: string, audience: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    if (payload.email_verified !== true || typeof payload.email !== 'string') {
      throw new Error('Token has no verified email');
    }
    return payload.email;
  }
}

/**
 * Guards /internal/jobs/*: only Cloud Scheduler's service account, with a token minted for
 * this API. When jobs aren't configured the routes don't exist (404).
 */
@Injectable()
export class JobsGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly verifier: JobTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { JOBS_OIDC_AUDIENCE: audience, JOBS_INVOKER_EMAIL: invoker } = this.env;
    if (!audience || !invoker) throw new NotFoundException();
    const header = context.switchToHttp().getRequest<Request>().get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw AppError.unauthenticated();
    let email: string;
    try {
      email = await this.verifier.verify(token, audience);
    } catch {
      throw AppError.unauthenticated();
    }
    if (email.toLowerCase() !== invoker.toLowerCase()) throw AppError.forbidden();
    return true;
  }
}
