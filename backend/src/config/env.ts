import { z } from 'zod';
import { parseKeyRing } from '../common/crypto/field-cipher.js';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

// Env vars arrive as strings; "true"/"1" are the only truthy spellings we accept.
const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Cloud Run injects PORT (8080); keep the same default locally so the web proxy matches.
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must be a postgres:// URL'),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    // pretty = one readable line per entry (needs the pino-pretty dev dependency); json = for
    // servers and log collectors. Default: pretty in development, json in production.
    LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
    // Comma-separated origins allowed to call the API from a browser. In production the web
    // app is served from the same origin (Firebase Hosting rewrite), so this is usually empty.
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    // Swagger UI is on by default outside production; production must opt in.
    ENABLE_DOCS: booleanFlag,
    // Proxy hops in front of the API whose X-Forwarded-For entries are trusted for req.ip
    // (rate limiting, audit). 0 locally; 1 behind Cloud Run. Verify when adding a load balancer.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Lets logs link to Cloud Trace (`projects/<id>/traces/<trace>`). Optional locally.
    GCP_PROJECT_ID: z.string().min(1).optional(),

    // ── Auth ──
    // Signs access and step-up tokens and keys the OTP hashes. 32+ random characters.
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    // Public URL of the web app, used in invitation links.
    APP_URL: z.url().default('http://localhost:5173'),

    // ── Personal data at rest (design §8) ──
    // Field-encryption key ring "keyId:base64(32 bytes),…"; the first key encrypts new values.
    FIELD_ENCRYPTION_KEYS: z.string().refine(
      (v) => {
        try {
          parseKeyRing(v);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'must be "keyId:base64,…" with 32-byte keys and unique ids' },
    ),
    // Keys the duplicate-check hashes of encrypted fields. base64, 32+ bytes. Never rotate
    // without re-indexing.
    FIELD_INDEX_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length >= 32, 'must be base64 of 32+ bytes'),

    // ── Scheduled jobs (Cloud Scheduler → /internal/jobs/*, design §4.6) ──
    // Both set = jobs endpoints accept Google OIDC tokens with this audience from this service
    // account. Unset = the endpoints answer 404.
    JOBS_OIDC_AUDIENCE: z.string().min(1).optional(),
    JOBS_INVOKER_EMAIL: z.email().optional(),
    // On a plain VM (no Cloud Scheduler): cron calls the jobs with this bearer secret instead.
    // 32+ random characters; only reachable from inside the server (the proxy blocks
    // /api/v1/internal/ from the internet).
    JOBS_SHARED_SECRET: z
      .string()
      .min(32, 'JOBS_SHARED_SECRET must be at least 32 characters')
      .optional(),

    // ── M-Pesa (Daraja) ──
    // "simulated" answers like Daraja without calling it (local dev, demos). Production must be live.
    DARAJA_MODE: z.enum(['live', 'simulated']).optional(),
    // Base URL Safaricom calls back (callback URLs = <base>/api/v1/hooks/pay/<token>/...).
    // Defaults to APP_URL, which reaches the API through the Firebase Hosting /api rewrite.
    PUBLIC_API_URL: z.url().optional(),
    // Addresses allowed to call the M-Pesa webhooks. Default: Safaricom's published list
    // (src/modules/mpesa/callback-ips.ts) — confirm against current Daraja docs at go-live.
    MPESA_CALLBACK_IPS: z
      .string()
      .optional()
      .transform((v) =>
        v
          ? v
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      ),

    // ── Files (receipts, meter photos) ── "local" keeps them under STORAGE_DIR (dev/test);
    // "gcs" uses the private bucket STORAGE_BUCKET with the service account's identity.
    STORAGE_DRIVER: z.enum(['local', 'gcs']).optional(),
    STORAGE_DIR: z.string().default('.storage'),
    STORAGE_BUCKET: z.string().min(3).optional(),

    // ── Messaging ── "log" writes messages to the log instead of sending (dev/test).
    SMS_PROVIDER: z.enum(['log', 'africastalking']).default('log'),
    AT_USERNAME: z.string().optional(),
    AT_API_KEY: z.string().optional(),
    AT_SENDER_ID: z.string().optional(),
    EMAIL_PROVIDER: z.enum(['log', 'smtp']).default('log'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default('KodiHub <noreply@example.invalid>'),
  })
  .superRefine((env, ctx) => {
    const need = (cond: boolean, keys: (keyof typeof env)[], why: string) => {
      if (!cond) return;
      for (const key of keys) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: `required when ${why}` });
      }
    };
    need(
      env.SMS_PROVIDER === 'africastalking',
      ['AT_USERNAME', 'AT_API_KEY'],
      'SMS_PROVIDER=africastalking',
    );
    // Production may keep files on local disk only on a persistent volume (an absolute path,
    // e.g. a Docker volume on a VM) — never the container's own throwaway filesystem.
    if (
      env.NODE_ENV === 'production' &&
      env.STORAGE_DRIVER === 'local' &&
      !env.STORAGE_DIR.startsWith('/')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DIR'],
        message:
          'must be an absolute path on a persistent volume when STORAGE_DRIVER=local in production',
      });
    }
    const driver = env.STORAGE_DRIVER ?? (env.NODE_ENV === 'production' ? 'gcs' : 'local');
    need(driver === 'gcs', ['STORAGE_BUCKET'], 'STORAGE_DRIVER=gcs');
    if (env.NODE_ENV === 'production' && env.DARAJA_MODE === 'simulated') {
      ctx.addIssue({
        code: 'custom',
        path: ['DARAJA_MODE'],
        message: 'must be live in production',
      });
    }
    need(
      env.EMAIL_PROVIDER === 'smtp',
      ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
      'EMAIL_PROVIDER=smtp',
    );
  });

export type Env = z.infer<typeof envSchema> & {
  LOG_LEVEL: (typeof LOG_LEVELS)[number];
  LOG_FORMAT: 'json' | 'pretty';
  DARAJA_MODE: 'live' | 'simulated';
  STORAGE_DRIVER: 'local' | 'gcs';
};

export class InvalidEnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidEnvError';
  }
}

/** Parses and validates process env. Throws InvalidEnvError listing every problem at once. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // `KEY=` in a .env file (or an empty Secret Manager value) means "not set", not "".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new InvalidEnvError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const env = result.data;
  return {
    ...env,
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
    LOG_FORMAT: env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty'),
    ENABLE_DOCS: env.NODE_ENV !== 'production' || env.ENABLE_DOCS,
    DARAJA_MODE: env.DARAJA_MODE ?? (env.NODE_ENV === 'production' ? 'live' : 'simulated'),
    STORAGE_DRIVER: env.STORAGE_DRIVER ?? (env.NODE_ENV === 'production' ? 'gcs' : 'local'),
  };
}
