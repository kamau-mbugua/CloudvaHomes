/** SMS routing types (docs/specs/2026-11-08-sms-platform-and-org-design.md). */

export type SmsProviderConfig =
  | {
      provider: 'AFRICASTALKING';
      username: string;
      apiKey: string;
      senderId: string | null;
      sandbox: boolean;
    }
  | { provider: 'TEXTSMS'; partnerId: string; apiKey: string; senderId: string | null }
  | {
      provider: 'HOSTPINNACLE';
      userId: string;
      password: string;
      apiKey: string;
      senderId: string;
    };

/** Messages about a person's KodiHub account: KodiHub's provider and sender, never units. */
export type PlatformSmsType =
  | 'login_otp'
  | 'password_reset'
  | 'step_up'
  | 'admin_2fa'
  | 'invitation'
  | 'operator_welcome'
  | 'owner_portal_access'
  | 'payout_changed'
  | 'sms_test';

/** An organisation talking to its own tenants, guests, landlords and owners. */
export type OrgSmsType =
  | 'booking_otp'
  | 'booking'
  | 'stay_payment'
  | 'payment_receipt'
  | 'rent_reminder'
  | 'reminder_manual'
  | 'portal_access'
  | 'broadcast'
  | 'rent_change'
  | 'tenant_notice';

export type OrgSmsSpec = { kind: 'org'; orgId: string; type: OrgSmsType };
export type SmsSpec = { kind: 'platform'; type: PlatformSmsType } | OrgSmsSpec;

/** A code, link or password inside an SMS, kept out of the logged text (shown on reveal). */
export interface SmsSecret {
  value: string;
  label: string;
}

export type SmsWarning = 'LOW' | 'EMPTY' | 'FAILING';
export type SmsRouteName = 'PLATFORM' | 'ORG_PROVIDER' | 'PLATFORM_FALLBACK' | 'PLATFORM_FREE';

export interface SmsOutcome {
  status: 'SENT' | 'FAILED' | 'NO_UNITS';
  route: SmsRouteName | null;
  /** Units taken from the organisation's balance (0 unless charged and sent). */
  units: number;
  reason: string | null;
  logId: string;
  /** A warning this send claimed for today (the caller tells the owners). */
  warn: SmsWarning | null;
  balance: number | null;
}

export const NO_UNITS_REASON = 'Not sent — no SMS units';

/** Thrown by NotificationsService when an SMS was not sent; carries why. */
export class SmsNotSentError extends Error {
  constructor(public readonly outcome: SmsOutcome) {
    super(outcome.status === 'NO_UNITS' ? NO_UNITS_REASON : (outcome.reason ?? 'SMS not sent'));
    this.name = 'SmsNotSentError';
  }
}
