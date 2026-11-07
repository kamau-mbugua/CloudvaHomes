import { parseDateOnly } from '../../../common/dates/date-only.js';

export type GuestSmsEvent =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'HELD'
  | 'PAY_NOW'
  | 'PAYMENT'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'BALANCE_DUE'
  | 'CHECKIN_INFO';

export interface GuestSmsData {
  biz: string;
  unit?: string;
  checkIn?: string | Date;
  checkOut?: string | Date;
  code?: string;
  link?: string | null;
  amount?: bigint | number | string;
  due?: bigint | number | string;
  refund?: bigint | number | string;
  time?: string;
  instructions?: string;
  /** How long an instant booking's hold lasts, in words ("15 minutes", "2 hours"). */
  window?: string;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function shortStayDate(d: string | Date | undefined): string {
  if (!d) return '';
  const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  return `${day} ${MONTHS[monthIdx] ?? ''}`;
}

export function formatStayKes(val: bigint | number | string | undefined): string {
  if (val === undefined || val === null) return 'KES 0';
  if (typeof val === 'string' && val.trim().startsWith('KES ')) {
    return val.trim();
  }
  const minor = typeof val === 'bigint' ? val : BigInt(val);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}KES ${whole}`;
}

export function shouldSendCheckInInfoNow(checkInIso: string, todayIso: string): boolean {
  const diff = Math.round(
    (parseDateOnly(checkInIso).getTime() - parseDateOnly(todayIso).getTime()) / 86_400_000,
  );
  return diff >= 0 && diff <= 2;
}

export function guestSms(event: GuestSmsEvent, d: GuestSmsData): string {
  const biz = d.biz;
  const unit = d.unit ?? '';
  const checkIn = shortStayDate(d.checkIn);
  const checkOut = shortStayDate(d.checkOut);
  const code = d.code ?? '';
  const link = d.link?.trim() ?? '';

  switch (event) {
    case 'REQUESTED':
      return link
        ? `${biz}: we got your request for ${unit}, ${checkIn}–${checkOut}. We'll reply within 24 hours. Booking ${code}: ${link}`
        : `${biz}: we got your request for ${unit}, ${checkIn}–${checkOut}. We'll reply within 24 hours. Booking ${code}.`;
    case 'CONFIRMED':
      return link
        ? `${biz}: your stay at ${unit}, ${checkIn}–${checkOut} is confirmed. Booking ${code}: ${link}`
        : `${biz}: your stay at ${unit}, ${checkIn}–${checkOut} is confirmed. Booking ${code}.`;
    case 'HELD': {
      const amount = formatStayKes(d.amount);
      const head = `${biz}: we are holding ${unit}, ${checkIn}–${checkOut} for you. Pay ${amount} within ${d.window ?? '15 minutes'} to confirm.`;
      return link ? `${head} Booking ${code}: ${link}` : `${head} Booking ${code}.`;
    }
    case 'PAY_NOW': {
      const amount = formatStayKes(d.amount);
      return link
        ? `${biz}: your request is accepted. Pay ${amount} within 12 hours to keep the dates: ${link}`
        : `${biz}: your request is accepted. Pay ${amount} within 12 hours to keep the dates.`;
    }
    case 'PAYMENT': {
      const amount = formatStayKes(d.amount);
      const due = formatStayKes(d.due);
      return `${biz}: we received ${amount} for booking ${code}. Still to pay: ${due}.`;
    }
    case 'DECLINED':
      return `${biz}: sorry, ${unit} isn't available for ${checkIn}–${checkOut}.`;
    case 'EXPIRED':
      return `${biz}: your booking ${code} wasn't paid in time, so the dates were released.`;
    case 'CANCELLED': {
      const refund = formatStayKes(d.refund);
      return `${biz}: booking ${code} is cancelled. Refund: ${refund}.`;
    }
    case 'BALANCE_DUE': {
      const due = formatStayKes(d.due);
      return link
        ? `${biz}: ${due} is due for your stay on ${checkIn}. Pay here: ${link}`
        : `${biz}: ${due} is due for your stay on ${checkIn}.`;
    }
    case 'CHECKIN_INFO':
      return `${biz}: welcome on ${checkIn}! Check-in from ${d.time ?? '14:00'}. ${d.instructions ?? ''}`.trim();
  }
}
