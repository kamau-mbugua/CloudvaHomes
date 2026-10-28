/**
 * Tenant portal shapes from the phase 7 API contract
 * (docs/plans/2026-10-28-phase-7-tenant-portal.md, `/api/v1/tenant/*`). Money is integer
 * minor units (KES cents). Invoices, statements and payments reuse the staff shapes —
 * the contract says "same shapes".
 */

import type { ChannelKind } from '../payments/types';
import type { TenancyStatus } from '../portfolio/types';

/** One row of `GET /tenant/accounts`. */
export interface TenantAccount {
  tenantId: string;
  code: string;
  name: string;
  organization: { id: string; name: string };
}

/**
 * The contract names a tenancy's `unit` and `property` without their fields. Read as
 * `{ id, number }` and `{ id, name }`, with a bare string accepted too.
 */
export type UnitLike = string | { id?: string; number: string };
export type PropertyLike = string | { id?: string; code?: string; name: string };

export interface PortalTenancy {
  id: string;
  unit: UnitLike;
  property: PropertyLike;
  rentAmount: number;
  billingDay: number;
  status: TenancyStatus;
  startDate: string;
  endDate: string | null;
}

/**
 * One way to pay: a paybill (account = the tenant's code), a till (no account), or a bank
 * account (with the tenant's code as the reference).
 */
export interface HowToPay {
  kind: ChannelKind;
  name: string;
  shortcode: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  accountRef: string | null;
}

/** An open invoice as the overview lists it — the staff `open-invoices` row. */
export interface PortalOpenInvoice {
  id: string;
  number: string;
  kind?: string;
  period: string;
  issueDate?: string;
  dueDate: string;
  total: number;
  amountPaid?: number;
  creditedAmount?: number;
  balance: number;
  overdue?: boolean;
}

/** `GET /tenant/accounts/:id`. */
export interface TenantOverview {
  tenant: { id: string; code: string; firstName: string; lastName: string; phone?: string | null; email?: string | null };
  organization: { name: string; phone: string | null; email: string | null };
  /** What they owe now. Never negative in practice; credit is separate. */
  balance: number;
  credit: number;
  depositHeld: number;
  tenancies: PortalTenancy[];
  openInvoices: PortalOpenInvoice[];
  howToPay: HowToPay[];
  /** The organisation has an M-Pesa channel covering their home: "Pay now" sends a prompt. */
  canPayInApp: boolean;
}
