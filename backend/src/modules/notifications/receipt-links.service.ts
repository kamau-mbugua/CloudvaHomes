import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { ShortLinksService } from './short-links.service.js';

export type ReceiptKind = 'stay' | 'rent';

const CONTEXT = 'receipt-link';
const DAY_S = 86_400;
/** How long a sent receipt link keeps working. */
export const RECEIPT_LINK_DAYS = 90;

/**
 * Links that open one receipt PDF without signing in (sent to guests and tenants by SMS). The
 * link carries an expiry and a server signature, so it can't be guessed or altered; it is sent as
 * a short link so the SMS stays within one unit.
 */
@Injectable()
export class ReceiptLinksService {
  constructor(
    private readonly cipher: FieldCipher,
    private readonly shortLinks: ShortLinksService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The full signed link. Expiry is rounded to the day, so a day's re-sends share one link. */
  signedUrl(kind: ReceiptKind, id: string, now = new Date()): string {
    const today = Math.floor(now.getTime() / 1000 / DAY_S) * DAY_S;
    const exp = today + (RECEIPT_LINK_DAYS + 1) * DAY_S;
    const base = (this.env.PUBLIC_API_URL ?? this.env.APP_URL).replace(/\/$/, '');
    return `${base}/api/v1/public/receipts/${kind}/${id}?e=${exp}&s=${this.sign(kind, id, exp)}`;
  }

  /** The signed link as a short link (falls back to the full link if shortening fails). */
  shortUrl(kind: ReceiptKind, id: string, orgId: string): Promise<string> {
    return this.shortLinks.shortenOrKeep(this.signedUrl(kind, id), {
      kind: 'receipt',
      orgId,
      days: RECEIPT_LINK_DAYS + 1,
    });
  }

  /** True when the link's signature matches and it has not expired. */
  verify(kind: string, id: string, exp: string, sig: string, now = new Date()): boolean {
    if (kind !== 'stay' && kind !== 'rent') return false;
    const e = Number(exp);
    if (!Number.isSafeInteger(e) || e * 1000 < now.getTime()) return false;
    const want = Buffer.from(this.sign(kind, id, e));
    const got = Buffer.from(sig ?? '');
    return want.length === got.length && timingSafeEqual(want, got);
  }

  private sign(kind: ReceiptKind, id: string, exp: number): string {
    return this.cipher.blindIndex(`${kind}:${id}:${exp}`, CONTEXT);
  }
}
