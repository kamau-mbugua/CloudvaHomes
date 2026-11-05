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
  leaseEndDate?: string | null;
  upcomingRentChanges?: { effectivePeriod: string; newRent: number }[];
  status: TenancyStatus;
  startDate: string;
  endDate: string | null;
  hasSignedLease?: boolean;
  /** Tenant portal redesign: what this home owes now, overdue part, days late, next due. */
  due?: number;
  overdue?: number;
  daysLate?: number;
  nextDueDate?: string | null;
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
  /** The home (tenancy) it bills. */
  tenancyId?: string;
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

/** A tenancy in the consolidated overview: also says which landlord account it belongs to. */
export interface ConsolidatedTenancy extends PortalTenancy {
  tenantId: string;
  tenantCode: string;
  orgName: string;
}

/** `GET /tenant/accounts/overview` — every home across every landlord/agency. */
export interface ConsolidatedOverview {
  balance: number;
  credit: number;
  depositHeld: number;
  /** Homes still lived in (ACTIVE or NOTICE). */
  homes: number;
  tenancies: ConsolidatedTenancy[];
  openInvoices: (PortalOpenInvoice & { tenantId: string; orgName: string })[];
  /** One full overview per landlord account. */
  accounts: TenantOverview[];
}

/** `GET /tenant/accounts/overview/monthly`. */
export interface MonthlyPoint {
  period: string;
  invoiced: number;
  paid: number;
}

/** `GET /tenant/accounts/overview/activity`. */
export interface ActivityItem {
  kind: 'PAYMENT' | 'INVOICE' | 'RENT_CHANGE' | 'NOTICE';
  at: string;
  title: string;
  amount: number | null;
  orgName: string;
  tenantId: string;
  link: string;
}

/** `GET /tenant/notices`. */
export interface TenantNotice {
  id: string;
  kind: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  tenantId: string;
  orgName: string | null;
}
