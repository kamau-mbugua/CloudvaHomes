import type { StkState } from '../mpesa/types';
import type { SmsAccountView, SmsProvider, SmsPurchaseState, SmsUsageStatus } from './types';

export const PROVIDER_LABEL: Record<SmsProvider, string> = {
  AFRICASTALKING: 'Africa’s Talking',
  TEXTSMS: 'TextSMS Kenya',
  HOSTPINNACLE: 'HostPinnacle',
};

export function smsModeLabel(a: SmsAccountView): string {
  if (a.mode === 'PLATFORM') return 'KodiHub sends your SMS';
  const parts = [a.senderId ? `sender ID ${a.senderId}` : null, a.provider ? PROVIDER_LABEL[a.provider] : null].filter(Boolean);
  return parts.length ? `Your own SMS account (${parts.join(', ')})` : 'Your own SMS account';
}

export interface SmsBanner {
  tone: 'warn' | 'danger';
  text: string;
  action: 'buy' | 'check';
}

/** The banner above every page while SMS needs attention (null = nothing to say). */
export function bannerFor(a: SmsAccountView): SmsBanner | null {
  if (a.mode === 'OWN') {
    return a.failing
      ? { tone: 'danger', text: `Your SMS account isn’t sending: ${a.failing.reason}`, action: 'check' }
      : null;
  }
  if (a.balance <= 0) {
    return {
      tone: 'danger',
      text: 'Out of SMS units — messages to your tenants and guests are not being sent.',
      action: 'buy',
    };
  }
  if (a.balance < a.lowBalanceLevel) return { tone: 'warn', text: `${a.balance} SMS units left.`, action: 'buy' };
  return null;
}

/** Cents for `units` at `unitPrice` cents, rounded up to whole shillings (as the server does). */
export function bundleAmount(units: number, unitPrice: number): number {
  return Math.ceil((units * unitPrice) / 100) * 100;
}

export function usageStatusLabel(s: SmsUsageStatus): string {
  return {
    SENT: 'Sent',
    FAILED: 'Failed',
    NO_UNITS: 'Not sent — no SMS units',
    LOGGED: 'Not sent — no SMS provider',
  }[s];
}

/** A purchase followed with the M-Pesa prompt hook: paid = success. */
export function purchaseStkState(s: SmsPurchaseState): StkState {
  return s === 'PAID' ? 'SUCCESS' : s;
}
