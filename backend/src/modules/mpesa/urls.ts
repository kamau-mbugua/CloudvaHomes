import type { Env } from '../../config/env.js';

/**
 * Webhook URLs for a channel. The path avoids words Daraja rejects in C2B URLs ("mpesa",
 * "safaricom"); the token is the only secret in it.
 */
export function callbackUrls(env: Pick<Env, 'PUBLIC_API_URL' | 'APP_URL'>, token: string) {
  const base = `${(env.PUBLIC_API_URL ?? env.APP_URL).replace(/\/$/, '')}/api/v1/hooks/pay/${token}`;
  return {
    stk: `${base}/stk`,
    c2bConfirm: `${base}/c2b/confirm`,
    c2bValidate: `${base}/c2b/validate`,
  };
}
