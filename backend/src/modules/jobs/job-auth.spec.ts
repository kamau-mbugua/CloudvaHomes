import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.js';
import { JobsGuard, type JobTokenVerifier } from './job-auth.js';

const SECRET = 's'.repeat(40);

const ctx = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        get: (h: string) => (h === 'authorization' ? authorization : undefined),
      }),
    }),
  }) as unknown as ExecutionContext;

const guard = (env: Partial<Env>, verified = 'scheduler@example.invalid') =>
  new JobsGuard(
    env as Env,
    {
      verify: (token: string) =>
        token === 'google-token' ? Promise.resolve(verified) : Promise.reject(new Error('bad')),
    } as unknown as JobTokenVerifier,
  );

describe('JobsGuard', () => {
  it('404s when no job auth is configured', async () => {
    await expect(guard({}).canActivate(ctx(`Bearer ${SECRET}`))).rejects.toMatchObject({
      status: 404,
    });
  });

  it('accepts the shared secret, and nothing else, on a VM', async () => {
    const g = guard({ JOBS_SHARED_SECRET: SECRET });
    await expect(g.canActivate(ctx(`Bearer ${SECRET}`))).resolves.toBe(true);
    await expect(g.canActivate(ctx(`Bearer ${SECRET}x`))).rejects.toMatchObject({ status: 401 });
    await expect(g.canActivate(ctx())).rejects.toMatchObject({ status: 401 });
  });

  it('still accepts Cloud Scheduler tokens when OIDC is configured', async () => {
    const env = {
      JOBS_SHARED_SECRET: SECRET,
      JOBS_OIDC_AUDIENCE: 'https://api.example.invalid',
      JOBS_INVOKER_EMAIL: 'scheduler@example.invalid',
    };
    await expect(guard(env).canActivate(ctx('Bearer google-token'))).resolves.toBe(true);
    await expect(
      guard(env, 'other@example.invalid').canActivate(ctx('Bearer google-token')),
    ).rejects.toMatchObject({ status: 403 });
  });
});
