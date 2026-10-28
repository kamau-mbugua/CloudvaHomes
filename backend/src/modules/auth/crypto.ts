import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

// Verified against when the user doesn't exist, so "unknown account" and "wrong password"
// take the same time and can't be told apart.
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(
  stored: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!stored) {
    dummyHash ??= hashPassword('timing-equaliser-not-a-real-password');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}

/** 256-bit random token for refresh tokens and invitation links (URL-safe). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Lookup hash for high-entropy tokens (refresh, invitation). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 6-digit numeric code. */
export function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Codes have only 10^6 possibilities, so a plain hash would be reversed instantly from a DB
 * dump; keying it with a server secret prevents that.
 */
export function hashCode(secret: string, code: string, target: string): string {
  return createHmac('sha256', secret).update(`${target}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
