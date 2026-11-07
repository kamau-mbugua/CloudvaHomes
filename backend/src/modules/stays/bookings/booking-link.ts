import { createHash } from 'node:crypto';
import type { FieldCipher } from '../../../common/crypto/field-cipher.js';

/**
 * Guest booking-page links (`https://{slug}.{SITE_DOMAIN}/b/{token}`).
 *
 * The token is a keyed hash of the booking id (FIELD_INDEX_KEY, which never rotates without a
 * re-index), so it can be rebuilt for later texts — "request accepted, pay here", balance due —
 * without storing it. Only its sha256 is stored (`accessTokenHash`), as before.
 */
export function bookingLinkToken(cipher: FieldCipher, bookingId: string): string {
  return cipher.blindIndex(bookingId, 'stay-booking-link');
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function bookingLinkUrl(slug: string, siteDomain: string, token: string): string {
  return `https://${slug}.${siteDomain}/b/${token}`;
}
