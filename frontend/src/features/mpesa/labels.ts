import type { Label } from '../portfolio/labels';
import type { DarajaEnvironment } from '../payments/types';
import type { InboundSource, MatchStatus, MatchedBy, StkState } from './types';

/** Words and badge tones for the M-Pesa screens, in one place. */

export const STK_STATE: Record<StkState, Label> = {
  PENDING: { label: 'Waiting', tone: 'ad__badge--info' },
  SUCCESS: { label: 'Paid', tone: 'ad__badge--ok' },
  FAILED: { label: 'Failed', tone: 'ad__badge--alert' },
  CANCELLED: { label: 'Cancelled', tone: 'ad__badge--warn' },
  TIMEOUT: { label: 'Timed out', tone: 'ad__badge--off' },
};

export const MATCH_STATUS: Record<MatchStatus, Label> = {
  UNMATCHED: { label: 'Unmatched', tone: 'ad__badge--warn' },
  MATCHED: { label: 'Matched', tone: 'ad__badge--ok' },
  IGNORED: { label: 'Ignored', tone: 'ad__badge--off' },
};

/** How a matched transaction found its tenant. */
export const MATCHED_BY: Record<MatchedBy, string> = {
  AUTO_STK: 'Automatically — answer to a payment request',
  AUTO_ACCOUNT: 'Automatically — account reference',
  AUTO_PHONE: 'Automatically — payer’s phone',
  MANUAL: 'Assigned by hand',
  EXISTING: 'Linked to a payment already entered by hand',
};

export const SOURCE: Record<InboundSource, Label> = {
  MPESA_STK: { label: 'Payment request', tone: 'ad__badge--info' },
  MPESA_C2B: { label: 'Paybill / till', tone: 'ad__badge--ok' },
  BANK_IPN: { label: 'Bank notification', tone: 'ad__badge--info' },
  BANK_STATEMENT: { label: 'Bank statement', tone: 'ad__badge--info' },
};

export const DARAJA_ENV: Record<DarajaEnvironment, Label> = {
  SANDBOX: { label: 'Sandbox (test)', tone: 'ad__badge--warn' },
  PRODUCTION: { label: 'Production', tone: 'ad__badge--ok' },
};
