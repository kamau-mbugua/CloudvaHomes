/**
 * Payment shapes from the phase 4 API contract (docs/plans/2026-10-27-phase-4-payments.md).
 * Money is integer minor units (KES cents); a negative amount is a reversal. Dates are
 * `YYYY-MM-DD` days, timestamps ISO instants.
 */

import type { InvoiceKind } from '../billing/types';
import type { RecordStatus, TenantRef } from '../portfolio/types';

export type ChannelKind = 'MPESA_PAYBILL' | 'MPESA_TILL' | 'BANK_ACCOUNT' | 'CASH' | 'CHEQUE';
/** How the money came in: a channel's kind, or `DEPOSIT` for a deposit applied at move-out. */
export type PaymentMethod = ChannelKind | 'DEPOSIT';
export type StatementEntryType = 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT' | 'REVERSAL' | 'DEPOSIT_APPLIED';
export type DepositKind = 'OPENING' | 'RECEIVED' | 'APPLIED' | 'REFUNDED' | 'REVERSAL';

export interface PaymentChannel {
  id: string;
  kind: ChannelKind;
  name: string;
  shortcode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  /** Empty = every property. */
  propertyIds: string[];
  status: RecordStatus;
  /**
   * Phase 5: the channel's M-Pesa (Daraja) connection. `null` (or absent, from an older
   * server) on channels that are not M-Pesa. Secrets are never returned.
   */
  daraja?: DarajaInfo | null;
  createdAt: string;
  updatedAt: string;
}

export type DarajaEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface DarajaInfo {
  configured: boolean;
  environment: DarajaEnvironment | null;
  /** Where Safaricom sends results. Absent until credentials are first saved. */
  callbackUrls: { stk: string; c2bConfirm: string; c2bValidate: string } | null;
  c2bRegisteredAt: string | null;
}

export interface Payment {
  id: string;
  number: string;
  method: PaymentMethod;
  /** Negative on a reversal. */
  amount: number;
  /** What is left as the tenant's credit (0 on a reversal). */
  unallocated: number;
  reference: string | null;
  paidBy: string | null;
  note: string | null;
  receivedAt: string;
  tenant: TenantRef;
  channel: { id: string; name: string; kind: ChannelKind } | null;
  /** Set on a reversal: the payment it reverses. */
  reversesId: string | null;
  /** Set on a payment that has been reversed. */
  reversedBy: { id: string; number: string } | null;
  reversalReason: string | null;
  recordedBy: { id: string; name: string } | null;
  /** Set on DEPOSIT payments (a deposit applied at move-out). */
  tenancyId?: string | null;
  /** Phase 5: the M-Pesa inbound transaction this payment was recorded from. */
  inboundId?: string | null;
  createdAt: string;
}

export interface PaymentAllocation {
  invoice: { id: string; number: string; period: string; kind: InvoiceKind };
  /** Negative on a reversal. */
  amount: number;
}

export interface PaymentDetail extends Payment {
  allocations: PaymentAllocation[];
}

/** `POST /payments` answers with the new payment and whether the SMS receipt went out. */
export interface RecordedPayment extends PaymentDetail {
  receiptSent: boolean;
}

/** One row of `GET /tenants/:id/open-invoices` — invoices with a balance, oldest due first. */
export interface OpenInvoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  period: string;
  issueDate: string;
  dueDate: string;
  total: number;
  amountPaid?: number;
  creditedAmount?: number;
  balance: number;
  overdue?: boolean;
}

export interface StatementEntry {
  date: string;
  type: StatementEntryType;
  reference: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number;
  invoiceId?: string | null;
  paymentId?: string | null;
}

export interface Statement {
  tenant: TenantRef;
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  creditBalance: number;
  depositHeld: number;
  entries: StatementEntry[];
}

export interface DepositTransaction {
  id: string;
  kind: DepositKind;
  /** Signed: money in is positive, applied / refunded is negative. */
  amount: number;
  reference: string | null;
  note: string | null;
  paymentId?: string | null;
  invoiceId?: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface Deposit {
  tenancyId: string;
  held: number;
  transactions: DepositTransaction[];
}

/** An invoice's allocations, as invoice detail lists them. */
export interface InvoicePayment {
  id: string;
  number: string;
  amount: number;
  receivedAt: string;
  method: PaymentMethod;
}
