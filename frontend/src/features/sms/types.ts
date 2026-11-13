/** Organisation SMS (docs/specs/2026-11-08-sms-platform-and-org-design.md). Money in cents, as strings. */

export type SmsProvider = 'AFRICASTALKING' | 'TEXTSMS' | 'HOSTPINNACLE';
/** LOGGED: no SMS provider was set up, so the server only wrote it to its log — never sent. */
export type SmsUsageStatus = 'SENT' | 'FAILED' | 'NO_UNITS' | 'LOGGED';
export type SmsPurchaseState = 'PENDING' | 'PAID' | 'FAILED';

export interface SmsAccountView {
  mode: 'PLATFORM' | 'OWN';
  provider: SmsProvider | null;
  senderId: string | null;
  balance: number;
  unitsBought: number;
  unitsUsed: number;
  lowBalanceLevel: number;
  fallbackToPlatform: boolean;
  unitPrice: string;
  failing: { since: string; reason: string } | null;
  canBuyInApp: boolean;
}

export interface SmsUsageRow {
  id: string;
  at: string;
  type: string;
  to: string;
  units: number;
  status: SmsUsageStatus;
  route: 'PLATFORM' | 'ORG_PROVIDER' | 'PLATFORM_FALLBACK' | 'PLATFORM_FREE' | null;
  reason: string | null;
}

export interface SmsTopUpRow {
  id: string;
  at: string;
  kind: 'PURCHASE' | 'ADJUSTMENT';
  units: number;
  balanceAfter: number;
  reason: string | null;
  amount: string | null;
  mpesaReceipt: string | null;
  source: 'STK' | 'C2B' | 'MANUAL' | null;
}

export interface SmsQuote {
  unitPrice: string;
  minUnits: number;
  bundles: { units: number; amount: string }[];
}

export interface SmsPurchase {
  id: string;
  units: number;
  amount: string;
  state: SmsPurchaseState;
  mpesaReceipt: string | null;
  createdAt: string;
  paidAt: string | null;
}
