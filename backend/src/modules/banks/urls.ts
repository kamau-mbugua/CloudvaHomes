import type { Env } from '../../config/env.js';

const base = (env: Pick<Env, 'PUBLIC_API_URL' | 'APP_URL'>) =>
  `${(env.PUBLIC_API_URL ?? env.APP_URL).replace(/\/$/, '')}/api/v1/hooks`;

/** A bank channel's notification URL; the token is the only secret in it. */
export const bankHookUrl = (env: Pick<Env, 'PUBLIC_API_URL' | 'APP_URL'>, token: string) =>
  `${base(env)}/bank/${token}`;

/** Safaricom B2C result/timeout URLs for a payout account. */
export const payoutHookUrls = (env: Pick<Env, 'PUBLIC_API_URL' | 'APP_URL'>, token: string) => ({
  result: `${base(env)}/payout/${token}/result`,
  timeout: `${base(env)}/payout/${token}/timeout`,
});
