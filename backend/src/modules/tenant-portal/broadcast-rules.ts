/** Pure rules for tenant broadcasts (phase 13). */

export interface BroadcastRow {
  tenantId: string;
  phone: string;
  email: string | null;
  userId: string | null;
  firstName: string;
  status: 'ACTIVE' | 'NOTICE' | 'ENDED';
}

export type Recipient = Omit<BroadcastRow, 'status'>;

/** Current tenants (ACTIVE or NOTICE), one entry per tenant however many units they rent. */
export function broadcastRecipients(rows: readonly BroadcastRow[]): Recipient[] {
  const seen = new Map<string, Recipient>();
  for (const { status, ...r } of rows) {
    if (status === 'ENDED' || seen.has(r.tenantId)) continue;
    seen.set(r.tenantId, r);
  }
  return [...seen.values()];
}

// GSM 03.38 basic set (as written in SMS), and the extension set that costs two characters.
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';

/** True when every character fits the GSM-7 alphabet (otherwise the SMS is sent as UCS-2). */
export function isGsm7(text: string): boolean {
  return Array.from(text).every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c));
}

/** How many SMS a text costs: GSM-7 160 (153 per part), otherwise UCS-2 70 (67 per part). */
export function smsSegments(text: string): number {
  if (!text) return 0;
  const chars = Array.from(text); // code points: GSM characters are counted one by one
  if (isGsm7(text)) {
    const length = chars.reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
    return length <= 160 ? 1 : Math.ceil(length / 153);
  }
  const units = text.length; // UTF-16 code units
  return units <= 70 ? 1 : Math.ceil(units / 67);
}
