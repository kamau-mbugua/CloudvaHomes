import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { violatesUnique } from '../../prisma/errors.js';

const TARGET_CONTEXT = 'short-link:target';
const CODE_CONTEXT = 'short-link:code';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DAY_MS = 86_400_000;

export const SHORT_CODE_PATTERN = /^[0-9A-Za-z]{8,16}$/;

/**
 * Code lengths: links that open something private (a booking page, an invitation, a receipt) get 12
 * characters (~71 bits, beyond guessing even at scale); map links point at a pin that is public
 * anyway, so 8 is enough. Longer is tried only if a shorter code is already taken.
 */
const LENGTHS: Record<ShortLinkKind, number[]> = {
  booking: [12, 13, 14, 15, 16],
  invitation: [12, 13, 14, 15, 16],
  receipt: [12, 13, 14, 15, 16],
  map: [8, 9, 10, 11, 12],
};

/** Wrong guesses allowed across all of KodiHub per minute; right links are never limited. */
const GLOBAL_MISSES_PER_MINUTE = 600;

/**
 * The rate-limit key for a visitor: the IPv4 address, or the /64 block for IPv6 (one home or
 * phone connection usually gets a whole /64, so per-address limits would be easy to dodge).
 */
export function rateKeyFor(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip.trim());
  if (v4) return v4[1]!;
  if (!ip.includes(':')) return ip.trim() || 'unknown';
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [
    ...left,
    ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'),
    ...right,
  ];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export type ShortLinkKind = 'booking' | 'map' | 'invitation' | 'receipt';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

function base62(bytes: Buffer): string {
  let n = BigInt(`0x${bytes.toString('hex')}`);
  let out = '';
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out;
}

/**
 * Where short links live: `go.{SITE_DOMAIN}` (go.kodihub.co.ke on prod, go.dev.kodihub.co.ke on
 * dev), or the API's own `/api/v1/s/` route when running locally. SHORT_LINK_BASE overrides it.
 */
export function shortLinkBase(env: Env): string {
  if (env.SHORT_LINK_BASE) return env.SHORT_LINK_BASE.replace(/\/$/, '');
  if (env.SITE_DOMAIN === 'localhost') {
    return `${(env.PUBLIC_API_URL ?? env.APP_URL).replace(/\/$/, '')}/api/v1/s`;
  }
  return `https://go.${env.SITE_DOMAIN}`;
}

/** True when `host` is the short-link host (go.{SITE_DOMAIN}). */
export function isShortLinkHost(host: string, env: Env): boolean {
  const clean = host.trim().toLowerCase().replace(/:\d+$/, '');
  return clean === `go.${env.SITE_DOMAIN.toLowerCase()}`;
}

/**
 * KodiHub's own short links, so SMS stay within one unit. A code is derived from the target with
 * a server secret: the same link always gets the same code, and nobody can guess one. Codes and
 * targets are stored only as a hash and ciphertext. Only KodiHub's own and Google Maps addresses
 * can be shortened, so this is never an open redirect.
 */
@Injectable()
export class ShortLinksService {
  private readonly log = new Logger(ShortLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly rateLimit: RateLimitService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The short link for `target`, valid for `days` (an existing one is reused and extended). */
  async shorten(
    target: string,
    opts: { kind: ShortLinkKind; orgId?: string | null; days?: number },
  ): Promise<string> {
    if (!this.allowed(target)) throw new Error('Only KodiHub and Google Maps links are shortened');
    const expiresAt = new Date(Date.now() + (opts.days ?? 365) * DAY_MS);
    const targetHash = sha256(target);
    const digest = Buffer.from(this.cipher.blindIndex(target, CODE_CONTEXT), 'base64url');
    const full = base62(digest).padStart(16, '0');
    return withoutOrgScope(async () => {
      for (const length of LENGTHS[opts.kind]) {
        const code = full.slice(0, length);
        const codeHash = sha256(code);
        const existing = await this.prisma.shortLink.findUnique({ where: { codeHash } });
        if (existing) {
          if (existing.targetHash !== targetHash) continue; // another link has this prefix
          if (existing.expiresAt < expiresAt) {
            await this.prisma.shortLink.update({
              where: { id: existing.id },
              data: { expiresAt },
            });
          }
          return `${shortLinkBase(this.env)}/${code}`;
        }
        try {
          await this.prisma.shortLink.create({
            data: {
              codeHash,
              targetHash,
              targetEnc: this.cipher.encrypt(target, TARGET_CONTEXT),
              kind: opts.kind,
              orgId: opts.orgId ?? null,
              expiresAt,
            },
          });
          return `${shortLinkBase(this.env)}/${code}`;
        } catch (e) {
          if (!violatesUnique(e, 'codeHash')) throw e;
          // Someone created it at the same moment: look again with the same length.
          const raced = await this.prisma.shortLink.findUnique({ where: { codeHash } });
          if (raced?.targetHash === targetHash) return `${shortLinkBase(this.env)}/${code}`;
        }
      }
      throw new Error('Could not make a short link');
    });
  }

  /**
   * Shortens when it can; on any problem returns the full link so a message still goes out.
   */
  async shortenOrKeep(
    target: string,
    opts: { kind: ShortLinkKind; orgId?: string | null; days?: number },
  ): Promise<string> {
    if (!target) return target;
    try {
      return await this.shorten(target, opts);
    } catch (err) {
      this.log.warn({ err, kind: opts.kind }, 'Short link not made; sending the full link');
      return target;
    }
  }

  /** Where a code points, counting the visit; null when unknown or expired. Rate-limited per IP. */
  async resolve(code: string, ip: string): Promise<string | null> {
    await this.rateLimit.hit({ key: `short:ip:${rateKeyFor(ip)}`, limit: 60, windowSeconds: 60 });
    const miss = async () => {
      // Caps guessing however many addresses an attacker uses; real links still open.
      await this.rateLimit.hit({
        key: 'short:miss:all',
        limit: GLOBAL_MISSES_PER_MINUTE,
        windowSeconds: 60,
      });
      return null;
    };
    if (!SHORT_CODE_PATTERN.test(code)) return miss();
    return withoutOrgScope(async () => {
      const row = await this.prisma.shortLink.findUnique({ where: { codeHash: sha256(code) } });
      if (!row || row.expiresAt < new Date()) return miss();
      await this.prisma.shortLink.update({
        where: { id: row.id },
        data: { clicks: { increment: 1 }, lastClickedAt: new Date() },
      });
      const target = this.cipher.decrypt(row.targetEnc, TARGET_CONTEXT);
      return this.allowed(target) ? target : null;
    });
  }

  /** KodiHub's own addresses (app, API, booking sites) and Google Maps only. */
  private allowed(target: string): boolean {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    const site = this.env.SITE_DOMAIN.toLowerCase();
    const own = [this.env.APP_URL, this.env.PUBLIC_API_URL]
      .filter((u): u is string => Boolean(u))
      .map((u) => new URL(u).hostname.toLowerCase());
    return (
      host === site ||
      host.endsWith(`.${site}`) ||
      own.includes(host) ||
      host === 'maps.google.com' ||
      host === 'www.google.com'
    );
  }
}

/** A plain page for a short link that is unknown or has expired. */
export const SHORT_LINK_GONE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link expired</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#0A2540">
<h1 style="font-size:1.4rem">This link has expired or is not valid</h1>
<p>Check the latest message you received, or contact whoever sent you the link.</p>
</body></html>`;
