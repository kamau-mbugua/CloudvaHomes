import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for personal data at rest (design §8): tenant and landlord ID
 * numbers today, payout details and channel secrets later.
 *
 * AES-256-GCM with a fresh 96-bit IV per value. The organisation id is bound in as
 * additional authenticated data, so a ciphertext copied into another organisation's row
 * fails to decrypt instead of leaking. Stored layout (one `bytea` column):
 *
 *   [version=1][keyId length][keyId utf8][iv 12][tag 16][ciphertext]
 *
 * Rotation: put the new key first in FIELD_ENCRYPTION_KEYS and keep the old ones after it —
 * new writes use the first key, and any listed key still decrypts.
 */
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface FieldKey {
  id: string;
  key: Buffer;
}

/** "k2:base64,k1:base64" → keys, first = active. Each key must decode to 32 bytes. */
export function parseKeyRing(spec: string): FieldKey[] {
  const keys = spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(':');
      const id = at > 0 ? part.slice(0, at) : '';
      const key = Buffer.from(part.slice(at + 1), 'base64');
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error(`Invalid field key id "${id}"`);
      if (key.length !== 32) throw new Error(`Field key "${id}" must be 32 bytes (base64)`);
      return { id, key };
    });
  if (!keys.length) throw new Error('FIELD_ENCRYPTION_KEYS has no keys');
  if (new Set(keys.map((k) => k.id)).size !== keys.length) {
    throw new Error('FIELD_ENCRYPTION_KEYS has duplicate key ids');
  }
  return keys;
}

export class FieldCipher {
  private readonly byId: Map<string, Buffer>;
  private readonly active: FieldKey;

  constructor(
    keys: FieldKey[],
    private readonly indexKey: Buffer,
  ) {
    if (!keys.length) throw new Error('FieldCipher needs at least one key');
    if (indexKey.length < 32) throw new Error('FIELD_INDEX_KEY must be at least 32 bytes');
    this.active = keys[0]!;
    this.byId = new Map(keys.map((k) => [k.id, k.key]));
  }

  encrypt(plaintext: string, context: string): Uint8Array<ArrayBuffer> {
    const keyId = Buffer.from(this.active.id, 'utf8');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.active.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const out = Buffer.concat([
      Buffer.from([VERSION, keyId.length]),
      keyId,
      iv,
      cipher.getAuthTag(),
      body,
    ]);
    // Prisma's Bytes fields take a plain Uint8Array backed by an ArrayBuffer.
    return new Uint8Array(out);
  }

  /** Throws if the value was tampered with, bound to another context, or its key is gone. */
  decrypt(stored: Uint8Array, context: string): string {
    const buf = Buffer.from(stored);
    if (buf.length < 2 || buf[0] !== VERSION) throw new Error('Unknown field ciphertext format');
    const idEnd = 2 + buf[1]!;
    const keyId = buf.subarray(2, idEnd).toString('utf8');
    const key = this.byId.get(keyId);
    if (!key) throw new Error(`Field key "${keyId}" is not configured`);
    const iv = buf.subarray(idEnd, idEnd + IV_BYTES);
    const tag = buf.subarray(idEnd + IV_BYTES, idEnd + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    const body = buf.subarray(idEnd + IV_BYTES + TAG_BYTES);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }

  /**
   * Deterministic keyed hash ("blind index") for equality checks without decrypting. Uses its
   * own key, which must never rotate without re-indexing every row.
   */
  blindIndex(normalised: string, context: string): string {
    return createHmac('sha256', this.indexKey)
      .update(`${context}\u0000${normalised}`)
      .digest('base64url');
  }
}

/** ID / passport numbers: upper-case, spaces and dashes removed. */
export function normalizeIdNumber(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** "12345678" → "•••••678". */
export function maskHint(hint: string | null): string | null {
  return hint ? `•••••${hint}` : null;
}
