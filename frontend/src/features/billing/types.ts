/**
 * Billing shapes from the phase 3 API contract (docs/plans/2026-10-27-phase-3-billing.md).
 * Money is integer minor units (KES cents). Readings and quantities are decimal STRINGS
 * ("12.500"), never floats. Periods are `YYYY-MM`, dates `YYYY-MM-DD`.
 */

import type { CodedRef, RecordStatus, TenantRef } from '../portfolio/types';

export type ChargeKind = 'FIXED' | 'VARIABLE' | 'METERED';
export type MoveInKind = 'DEPOSIT' | 'FEE';
export type InvoiceKind = 'MONTHLY' | 'MOVE_IN' | 'ADHOC';
export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
export type LineKind = 'RENT' | 'CHARGE' | 'MOVE_IN' | 'ADJUSTMENT';

export interface ChargeType {
  id: string;
  property: CodedRef;
  name: string;
  kind: ChargeKind;
  amount: number | null;
  unitRate: number | null;
  unitLabel: string | null;
  /** Empty = every unit in the property. */
  unitIds: string[];
  status: RecordStatus;
  meterCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MoveInCharge {
  id: string;
  property: CodedRef;
  name: string;
  kind: MoveInKind;
  /** Exactly one of `amount` and `rentMonths` is set. */
  amount: number | null;
  rentMonths: number | null;
  refundable: boolean;
  status: RecordStatus;
}

export interface Meter {
  id: string;
  serialNo: string;
  initialReading: string;
  status: RecordStatus;
  unit: { id: string; number: string };
  property: CodedRef;
  chargeType: { id: string; name: string; unitLabel: string | null };
  lastReading: { period: string; current: string } | null;
}

export interface ReadingSheetRow {
  meter: { id: string; serialNo: string };
  unit: { id: string; number: string };
  suggestedPrevious: string;
  reading: {
    id: string;
    previous: string;
    current: string;
    consumption: string;
    amount: number;
    note: string | null;
    billed: boolean;
    readAt: string;
    readBy: { id: string; name: string } | null;
    /** Phase 6: the meter photo, read through `GET /meter-readings/:id/photo`. */
    photo?: { id: string } | null;
  } | null;
}

export interface VariableGridRow {
  unit: { id: string; number: string };
  amount: number | null;
  billed: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  period: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  creditedAmount: number;
  balance: number;
  overdue: boolean;
  tenant: TenantRef;
  unit: { id: string; number: string };
  property: CodedRef;
  tenancyId: string;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  kind: LineKind;
  description: string;
  quantity: string;
  unitAmount: number;
  amount: number;
  refundable: boolean;
}

export interface CreditNote {
  id: string;
  number: string;
  amount: number;
  reason: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  creditNotes: CreditNote[];
  /** Phase 4: allocations to this invoice (a reversal's are negative). Optional for older servers. */
  payments?: { id: string; number: string; amount: number; receivedAt: string; method: string }[];
}

export interface RunPreviewItem {
  tenancyId: string;
  tenant: TenantRef;
  unit: { id: string; number: string };
  property: CodedRef;
  lines: { kind: LineKind; description: string; quantity: string; unitAmount: number; amount: number }[];
  total: number;
  missingReadings: { meterId: string; serialNo: string; chargeName: string }[];
}

export interface RunResult {
  date: string;
  period: string;
  created: number;
  invoiceIds: string[];
}
