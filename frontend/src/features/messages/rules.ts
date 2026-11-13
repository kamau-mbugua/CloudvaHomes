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

/**
 * A notice as tenants get it by SMS: "Makini Homes: <notice>" (it comes from KodiHub's sender
 * ID). Left alone when it already starts with the name. Must match the server's noticeSmsText.
 */
export function noticeSmsText(orgName: string, text: string): string {
  const name = orgName.trim();
  const body = text.trim();
  if (!name || body.toLowerCase().startsWith(name.toLowerCase())) return body;
  return `${name}: ${body}`;
}

/** Characters typed, and the SMS each tenant gets counting the organisation name in front. */
export function counterLabel(text: string, recipients: number, orgName = ''): string {
  const head = `${text.length} / ${MAX_BROADCAST_LENGTH} characters`;
  const parts = text.trim() ? smsSegments(noticeSmsText(orgName, text)) : 0;
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
