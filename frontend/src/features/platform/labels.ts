import type { Label } from '../portfolio/labels';
import type { OrgStatus, PlatformPaymentMethod, PlatformPaymentSource } from './types';

/** Words and badge tones for platform billing, in one place. */

export const ORG_STATUS: Record<OrgStatus, Label> = {
  TRIAL: { label: 'Trial', tone: 'ad__badge--info' },
  ACTIVE: { label: 'Active', tone: 'ad__badge--ok' },
  GRACE: { label: 'Overdue', tone: 'ad__badge--warn' },
  SUSPENDED: { label: 'Suspended', tone: 'ad__badge--alert' },
  CLOSED: { label: 'Closed', tone: 'ad__badge--off' },
};

/** One line on what each status means, for the organisation's own billing page. */
export const ORG_STATUS_MEANING: Record<OrgStatus, string> = {
  TRIAL: 'Free trial: months that end during the trial aren’t billed.',
  ACTIVE: 'Your account is in good standing.',
  GRACE: 'A KodiHub bill is overdue. Everything still works; pay it to avoid your account becoming read-only.',
  SUSPENDED: 'Read-only until the KodiHub bill is paid. Tenants can still pay rent, and rent payments can still be recorded.',
  CLOSED: 'This organisation’s KodiHub account is closed. Contact KodiHub to reopen it.',
};

export const PLATFORM_METHOD: Record<PlatformPaymentMethod, Label> = {
  MPESA: { label: 'M-Pesa', tone: 'ad__badge--ok' },
  BANK: { label: 'Bank transfer', tone: 'ad__badge--info' },
  CHEQUE: { label: 'Cheque', tone: 'ad__badge--off' },
  OTHER: { label: 'Other', tone: 'ad__badge--off' },
};

export const PLATFORM_SOURCE: Record<PlatformPaymentSource, string> = {
  STK: 'Paid in the app',
  C2B: 'Paid to the paybill',
  MANUAL: 'Recorded by KodiHub',
};

/** Methods a platform admin can record by hand. */
export const MANUAL_METHODS: PlatformPaymentMethod[] = ['BANK', 'CHEQUE', 'MPESA', 'OTHER'];
