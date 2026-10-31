/**
 * Report shapes from the phase 6 API contract (docs/plans/2026-10-27-phase-6-expenses-reports.md).
 * Every amount is integer cents; `rate` and `collectionRate` are 0–1, or null with
 * nothing to divide by. Periods are `YYYY-MM`, days `YYYY-MM-DD`.
 */

import type { CodedRef, TenantRef } from '../portfolio/types';

export interface OccupancyFigures {
  units: number;
  occupied: number;
  notice: number;
  vacant: number;
  unavailable: number;
  rate: number | null;
}

export interface TrendPoint {
  period: string;
  invoiced: number;
  collected: number;
  expenses: number;
}

export interface DashboardPropertyBreakdown extends OccupancyFigures {
  property: CodedRef;
  invoiced: number;
  collected: number;
  expenses: number;
  net: number;
}

export interface Dashboard {
  period: string;
  propertyId?: string | null;
  /** Today — arrears and occupancy are as of now, whatever the month. */
  asOf?: string;
  invoiced: number;
  collected: number;
  collectionRate: number | null;
  arrears: number;
  expenses: number;
  net: number;
  occupancy: OccupancyFigures;
  /** null for people who can't see reconciliation. */
  unmatchedMpesa: number | null;
  /** `overdue` is past-due only; not-yet-due balances are left out. */
  topOverdue: { tenant: TenantRef; overdue: number; oldestDueDate: string }[];
  /** 12 months, oldest first. */
  trend: TrendPoint[];
  /** Per-property breakdown when in consolidated portfolio mode. */
  byProperty?: DashboardPropertyBreakdown[];
}

export interface PnlFigures {
  invoiced: { rent: number; charges: number; moveIn: number; other: number; total: number };
  collected: number;
  /** Every category key, plus `total`. */
  expenses: Record<string, number> & { total: number };
  net: number;
}

export interface PnlReport {
  from: string;
  to: string;
  rows: (PnlFigures & { property: CodedRef })[];
  totals: PnlFigures;
}

export interface AgingFigures {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  credit: number;
}

export interface ArrearsReport {
  asOf: string;
  rows: (AgingFigures & { tenant: TenantRef; units: string[]; oldestDueDate?: string | null })[];
  totals: AgingFigures;
}

export interface OccupancyReport {
  rows: (OccupancyFigures & {
    property: CodedRef;
    vacantUnits: { id: string; number: string; vacantSince: string | null }[];
  })[];
  totals: OccupancyFigures;
}
