/**
 * Agency accounting shapes (phase 6b, docs/plans/2026-10-27-phase-6b-agency.md).
 *
 * Money is integer cents. Ledger amounts are SIGNED: + is owed to the landlord, − is owed
 * by them (commission, expenses, payouts made).
 *
 * Shapes follow the plan's API contract plus the backend's clarifications: balances,
 * payout and portal come from `GET /landlords/:id/account`; the statement carries
 * opening/closing balances, entries, totals, occupancy and arrears.
 */

import type { OccupancyReport } from '../reports/types';

export type CommissionBasis = 'PERCENT_OF_COLLECTED' | 'PERCENT_OF_INVOICED' | 'FIXED_MONTHLY';
export type CollectionMode = 'AGENCY_COLLECTS' | 'LANDLORD_COLLECTS';
export type CommissionableLine = 'RENT' | 'CHARGE' | 'MOVE_IN' | 'ADJUSTMENT';
export type LedgerBucket = 'PAYABLE' | 'DEPOSIT_HELD';
export type LedgerKind = 'COLLECTION' | 'COMMISSION' | 'EXPENSE' | 'DEPOSIT' | 'REMITTANCE' | 'ADJUSTMENT' | 'REVERSAL';
/** `SENDING` (phase 10): an M-Pesa payout is on its way; it can't be paid or cancelled meanwhile. */
export type RemittanceStatus = 'DRAFT' | 'APPROVED' | 'SENDING' | 'PAID' | 'CANCELLED';
/** An M-Pesa B2C payout. `UNCERTAIN`: M-Pesa didn't confirm either way — a person must check. */
export type RemittancePayoutState = 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNCERTAIN';
export type RemittanceDirection = 'TO_LANDLORD' | 'FROM_LANDLORD';
export type PayoutMethod = 'BANK' | 'MPESA' | 'CHEQUE';

export interface LandlordRef {
  id: string;
  code: string;
  name: string;
}

export interface PropertyRef {
  id: string;
  code: string;
  name: string;
}

export interface Agreement {
  id: string;
  landlord: LandlordRef;
  /** Empty = every property of the landlord. */
  propertyIds: string[];
  commissionBasis: CommissionBasis;
  /** Basis points: 1000 = 10%. Null for a fixed monthly fee. */
  commissionBps: number | null;
  /** Cents, for FIXED_MONTHLY. */
  fixedAmount: number | null;
  commissionableLines: CommissionableLine[];
  collection: CollectionMode;
  /** 1–28. */
  remittanceDay: number;
  deductExpenses: boolean;
  holdDeposits: boolean;
  /** YYYY-MM-DD. */
  startDate: string;
  endDate: string | null;
  active: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  bucket: LedgerBucket;
  kind: LedgerKind;
  /** Signed cents; + owed to the landlord. */
  amount: number;
  /** The event's date (ISO date or instant). */
  occurredAt: string;
  memo: string | null;
  property: PropertyRef | null;
  unit: { id: string; number: string } | null;
  tenant: { id: string; code: string; firstName: string; lastName: string } | null;
  payment: { id: string; number: string } | null;
  invoice: { id: string; number: string } | null;
  expense: { id: string; name: string } | null;
  remittance: { id: string; number: string } | null;
  createdAt: string;
  /** The bucket's running balance after this entry (ledger list and statement). */
  balance?: number;
}

export interface PayoutSummary {
  method: PayoutMethod;
  /** "KCB · •••• 6789", "•••• 0042". */
  masked: string;
  updatedAt?: string | null;
}

export interface Balances {
  payable: number;
  depositHeld: number;
}

/**
 * `GET /landlords/:id/account` — the landlord's money standing. Payout and portal writes
 * answer with the same object.
 */
export interface LandlordAccount {
  balances: Balances;
  hasActiveAgreement: boolean;
  payout: PayoutSummary | null;
  portal: { hasAccess: boolean; invitedAt: string | null };
}

/** A person on a remittance. The contract names the field, not its shape. */
export type PersonRef = { id: string; firstName?: string | null; lastName?: string | null; name?: string | null } | null;

export interface Remittance {
  id: string;
  number: string;
  landlord: LandlordRef;
  /** YYYY-MM. */
  period: string;
  direction: RemittanceDirection;
  collections: number;
  commission: number;
  expenses: number;
  adjustments: number;
  /** The payable balance when drafted: + the agency pays out, − the landlord owes. */
  net: number;
  /** Signed balance carried in from before this remittance's activity. */
  broughtForward?: number;
  status: RemittanceStatus;
  /** Null when the nightly job drafted it — then anyone with approve may approve. */
  draftedBy: PersonRef;
  approvedBy: PersonRef;
  approvedAt: string | null;
  paidBy: PersonRef;
  paidAt: string | null;
  method: PayoutMethod | null;
  reference: string | null;
  payoutMasked: string | null;
  cancelledReason: string | null;
  createdAt: string;
  /** Phase 10: the latest M-Pesa payout for it, if one was sent. */
  payout?: RemittancePayout | null;
  /**
   * Phase 10: where it would be paid now — the landlord's payout method and masked
   * details on file (`null` = none). Absent from an older server; then the landlord
   * account is asked.
   */
  payoutTo?: { method: PayoutMethod; masked: string | null } | null;
}

/** `payout` on a remittance (phase 10). */
export interface RemittancePayout {
  id: string;
  state: RemittancePayoutState;
  amount: number;
  /** Masked, e.g. "+254 7•• ••• 012". */
  phone: string | null;
  /** The M-Pesa receipt once paid. */
  receipt: string | null;
  /** Safaricom's words on a failure. */
  resultDesc: string | null;
  /** What the person who resolved an UNCERTAIN payout wrote. */
  resolvedNote?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

// ---------------------------------------------------------------- owner statement

export interface StatementArrearsRow {
  tenant: { id?: string; code: string; firstName: string; lastName: string };
  units: string[];
  total: number;
  overdue: number;
}

/**
 * `GET /landlords/:id/statement?from&to` (and the owner portal's). `entries` are ledger
 * entries of both buckets, each with its bucket's running balance. In `totals`,
 * commission, expenses and remittances are POSITIVE amounts deducted; adjustments are
 * signed.
 */
export interface OwnerStatement {
  landlord?: LandlordRef;
  organization?: { id?: string; name: string };
  /** YYYY-MM. */
  from: string;
  to: string;
  period?: { start: string; end: string };
  opening: Balances;
  closing: Balances;
  entries: LedgerEntry[];
  totals: { collections: number; commission: number; expenses: number; remittances: number; adjustments: number };
  occupancy?: OccupancyReport;
  arrears?: { totals?: { total?: number; overdue?: number }; rows: StatementArrearsRow[] };
}

// ---------------------------------------------------------------- owner portal

/** `GET /owner/landlords` rows. */
export interface OwnerLandlordRow {
  landlordId: string;
  code?: string;
  name: string;
  organization: { id: string; name: string };
}

/** `GET /owner/landlords/:id`. */
export interface OwnerLandlord {
  landlord: LandlordRef;
  organization: { id?: string; name: string; phone?: string | null; email?: string | null };
  balances: Balances;
  payout: PayoutSummary | null;
  occupancy?: OccupancyReport;
  arrears?: OwnerStatement['arrears'];
}
