/**
 * M-Pesa shapes from the phase 5 API contract (docs/plans/2026-10-27-phase-5-mpesa.md).
 * Money is integer minor units (KES cents); timestamps are ISO instants.
 */

import type { ChannelKind } from '../payments/types';

export type StkState = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
/** Phase 10 adds bank money: a bank's notification (`BANK_IPN`) or an imported statement line. */
export type InboundSource = 'MPESA_STK' | 'MPESA_C2B' | 'BANK_IPN' | 'BANK_STATEMENT';
export type MatchStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED';
export type MatchedBy = 'AUTO_STK' | 'AUTO_ACCOUNT' | 'AUTO_PHONE' | 'MANUAL' | 'EXISTING';

/** A tenant as M-Pesa screens name them (no phone in the contract's ref). */
export interface MpesaTenantRef {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

/** `POST /payments/stk` (202) and `GET /payments/stk/:id`. */
export interface StkRequest {
  id: string;
  state: StkState;
  phone: string;
  amount: number;
  accountRef: string | null;
  resultDesc: string | null;
  mpesaReceipt: string | null;
  tenant: MpesaTenantRef;
  channel: { id: string; name: string };
  /** The invoices it pays first (opened from an invoice). */
  invoiceIds?: string[];
  paymentId: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** One row of `GET /inbound-transactions`. */
export interface InboundTransaction {
  id: string;
  source: InboundSource;
  /** The M-Pesa receipt, e.g. TEST000001. */
  providerRef: string;
  amount: number;
  payerName: string | null;
  payerPhone: string | null;
  accountRef: string | null;
  occurredAt: string;
  matchStatus: MatchStatus;
  matchedBy: MatchedBy | null;
  channel: { id: string; name: string; kind: ChannelKind };
  tenant: MpesaTenantRef | null;
  payment: { id: string; number: string } | null;
  ignoredReason: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface MatchSuggestion {
  tenant: MpesaTenantRef;
  /** Why it is suggested, e.g. "Phone matches". */
  reason: string;
}

/** `GET /inbound-transactions/:id`: the row plus what Safaricom sent and who it might be. */
export interface InboundDetail extends InboundTransaction {
  raw: unknown;
  suggestions: MatchSuggestion[];
}
