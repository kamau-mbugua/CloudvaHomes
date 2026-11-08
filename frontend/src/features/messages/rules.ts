/** Notices to tenants (phase 13): SMS counting and how a broadcast's result reads. */

export const MAX_BROADCAST_LENGTH = 480;

// GSM 03.38 basic and extension sets — must match backend/src/modules/tenant-portal/broadcast-rules.ts.
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';

export function smsSegments(text: string): number {
  if (!text) return 0;
  const chars = Array.from(text);
  if (chars.every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c))) {
    const length = chars.reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
    return length <= 160 ? 1 : Math.ceil(length / 153);
  }
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}

export function counterLabel(text: string, recipients: number): string {
  const head = `${text.length} / ${MAX_BROADCAST_LENGTH} characters`;
  const parts = smsSegments(text);
  if (!parts) return head;
  return `${head} · ${parts} SMS per tenant · about ${parts * recipients} SMS`;
}

export interface BroadcastCounts {
  status: 'QUEUED' | 'SENDING' | 'DONE';
  recipients: number;
  sent: number;
  failed: number;
  emailed: number;
  notified: number;
  alsoEmail: boolean;
}

export function broadcastSummary(b: BroadcastCounts): string {
  if (b.status !== 'DONE') return `Sending to ${b.recipients} ${b.recipients === 1 ? 'tenant' : 'tenants'}…`;
  const parts = [`${b.sent} of ${b.recipients} ${b.recipients === 1 ? 'text' : 'texts'} sent`];
  if (b.failed) parts.push(`${b.failed} failed`);
  if (b.alsoEmail) parts.push(`${b.emailed} emailed`);
  if (b.notified) parts.push(`${b.notified} in the tenant app`);
  return parts.join(' · ');
}

/**
 * The SMS-units line under a notice: units needed vs the organisation's KodiHub balance.
 * `short` means the balance can't cover it (the server would refuse with SMS_UNITS_LOW).
 */
export function unitsLine(
  partsPerMessage: number,
  recipients: number,
  account: { mode: 'PLATFORM' | 'OWN'; balance: number } | null,
): { text: string; short: boolean } | null {
  if (!account) return null;
  if (account.mode === 'OWN') return { text: 'Sent from your own SMS account', short: false };
  const needed = partsPerMessage * recipients;
  return { text: `About ${needed} SMS units · you have ${account.balance}`, short: needed > account.balance };
}
