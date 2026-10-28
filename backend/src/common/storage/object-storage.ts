import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Storage } from '@google-cloud/storage';

/**
 * Private file storage (design §4.6/§8). Files go in and out through the API only — no public
 * or signed URLs — so every download passes the same permission checks as the record.
 */
export abstract class ObjectStorage {
  abstract put(key: string, data: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}

/** Files under a directory (dev, tests). Keys can't escape it. */
export class LocalStorage extends ObjectStorage {
  private readonly root: string;

  constructor(dir: string) {
    super();
    this.root = resolve(dir);
  }

  private path(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Storage key escapes the storage root');
    return full;
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

/** A private Cloud Storage bucket, using the runtime service account (no key files). */
export class GcsStorage extends ObjectStorage {
  private readonly bucket;

  constructor(bucket: string) {
    super();
    this.bucket = new Storage().bucket(bucket);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.bucket.file(key).save(data, {
      contentType,
      resumable: false,
      metadata: { cacheControl: 'private, no-store' },
    });
  }

  async get(key: string): Promise<Buffer> {
    const [data] = await this.bucket.file(key).download();
    return data;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }
}

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];

/** The file's real type from its first bytes, or null if it isn't one we accept. */
export function sniffType(data: Buffer): AllowedType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  return null;
}
