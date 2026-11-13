/** Labels and date rules for KodiHub admin's SMS list, message sheet and dashboard. */

import type { SmsProvider, SmsUsageStatus } from '../sms/types';

export type SmsKind = 'PLATFORM' | 'ORG';
export type SmsRoute = 'PLATFORM' | 'ORG_PROVIDER' | 'PLATFORM_FALLBACK' | 'PLATFORM_FREE';

/** What each kind of SMS is, in words an admin recognises. */
export const SMS_TYPE_LABEL: Record<string, string> = {
  login_otp: 'Sign-in code',
  password_reset: 'Password reset code',
  step_up: 'Confirmation code',
  admin_2fa: 'Admin sign-in code',
  invitation: 'Invitation',
  operator_welcome: 'Operator welcome',
  owner_portal_access: 'Owner portal access',
  payout_changed: 'Payout details changed',
  sms_test: 'Test message',
  booking_otp: 'Guest booking code',
  booking: 'Booking',
  stay_payment: 'Stay payment',
  payment_receipt: 'Payment receipt',
  rent_reminder: 'Rent reminder',
  reminder_manual: 'Reminder sent by hand',
  portal_access: 'Tenant portal access',
  broadcast: 'Notice to tenants',
  rent_change: 'Rent change',
  tenant_notice: 'Tenant notice',
};

/** Types KodiHub sends about people's accounts, then organisations' own (filter order). */
export const PLATFORM_TYPES = [
  'login_otp',
  'password_reset',
  'step_up',
  'admin_2fa',
  'invitation',
  'operator_welcome',
  'owner_portal_access',
  'payout_changed',
  'sms_test',
];
export const ORG_TYPES = [
  'booking_otp',
  'booking',
  'stay_payment',
  'payment_receipt',
  'rent_reminder',
  'reminder_manual',
  'portal_access',
  'broadcast',
  'rent_change',
  'tenant_notice',
];

export function smsTypeLabel(type: string): string {
  const known = SMS_TYPE_LABEL[type];
  if (known) return known;
  const words = type.replace(/_/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Message';
}

export const ROUTE_LABEL: Record<SmsRoute, string> = {
  PLATFORM: 'KodiHub’s provider',
  ORG_PROVIDER: 'Organisation’s own account',
  PLATFORM_FALLBACK: 'KodiHub, as fallback',
  PLATFORM_FREE: 'KodiHub, free guest code',
};

export function smsStatus(s: SmsUsageStatus): { label: string; tone: 'ok' | 'bad' | 'warn' } {
  if (s === 'SENT') return { label: 'Sent', tone: 'ok' };
  if (s === 'FAILED') return { label: 'Failed', tone: 'bad' };
  return { label: 'No units', tone: 'warn' };
}

/** "0.965" → "96.5%"; no messages → "—". */
export function rateText(rate: number | null): string {
  if (rate === null) return '—';
  const pct = Math.round(rate * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** First and last day of a month ("2026-11"), stopping at `today` for the current month. */
export function monthRange(month: string, today: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${pad(last)}`;
  return { from: `${month}-01`, to: end > today ? today : end };
}

export type StatsPreset = 'month' | '7d' | '30d' | 'lastMonth';

export const PRESET_LABEL: Record<StatsPreset, string> = {
  month: 'This month',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  lastMonth: 'Last month',
};

/** The dashboard's period for a preset, in Nairobi days. */
export function presetRange(preset: StatsPreset, today: string): { from: string; to: string } {
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'lastMonth': {
      const prev = addDays(`${today.slice(0, 7)}-01`, -1);
      return monthRange(prev.slice(0, 7), today);
    }
    default:
      return monthRange(today.slice(0, 7), today);
  }
}

/** A round top for a chart axis: 7 → 10, 23 → 25, 140 → 200; never below 1. */
export function niceMax(n: number): number {
  if (n <= 1) return 1;
  const step = 10 ** Math.floor(Math.log10(n));
  for (const f of [1, 2, 2.5, 5, 10]) {
    if (f * step >= n) return f * step;
  }
  return 10 * step;
}

/** Percent of `part` in `whole` for bar widths, 0 when there is nothing. */
export function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

// ── API shapes (`/platform/sms/...`) ──


export interface SmsLogRow {
  id: string;
  at: string;
  organization: { id: string; name: string } | null;
  kind: SmsKind;
  type: string;
  /** Masked: "+2547****111". */
  to: string;
  units: number;
  route: SmsRoute | null;
  provider: SmsProvider | null;
  status: SmsUsageStatus;
  reason: string | null;
  canOpen: boolean;
  hasSecret: boolean;
}

export interface SmsLogDetail extends Omit<SmsLogRow, 'canOpen' | 'hasSecret'> {
  /** The full number. */
  to: string;
  providerMessageId: string | null;
  /** Null for messages sent before KodiHub kept SMS text. */
  text: string | null;
  secret: { label: string; hidden: true } | null;
}

export interface SmsTestResult {
  sent: boolean;
  provider: SmsProvider | null;
  messageId: string | null;
  reason: string | null;
}

interface Counts {
  sent: number;
  failed: number;
}

export interface SmsStats {
  from: string;
  to: string;
  totals: {
    messages: number;
    sent: number;
    failed: number;
    noUnits: number;
    successRate: number | null;
    unitsUsed: number;
    kodihubMessages: number;
    orgMessages: number;
  };
  money: { unitsSold: number; amountPaid: string; unitsHeld: number };
  daily: { day: string; sent: number; failed: number; noUnits: number }[];
  byProvider: (Counts & { provider: SmsProvider })[];
  byType: (Counts & { type: string; kind: SmsKind; noUnits: number })[];
  byRoute: (Counts & { route: SmsRoute })[];
  topOrgs: (Counts & { orgId: string; name: string; noUnits: number; units: number })[];
  lowBalance: { orgId: string; name: string; balance: number; lowBalanceLevel: number }[];
  failing: {
    orgId: string;
    name: string;
    provider: SmsProvider | null;
    since: string;
    reason: string | null;
  }[];
  topReasons: { reason: string; count: number }[];
}
