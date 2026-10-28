/**
 * Expense shapes from the phase 6 API contract (docs/plans/2026-10-27-phase-6-expenses-reports.md).
 * Money is integer minor units (KES cents); `incurredOn`, `nextDue` and `endDate` are
 * `YYYY-MM-DD` days, timestamps ISO instants.
 */

import type { CodedRef, RecordStatus } from '../portfolio/types';

export type ExpenseCategory =
  | 'REPAIRS'
  | 'UTILITIES'
  | 'SECURITY'
  | 'CLEANING'
  | 'SALARIES'
  | 'TAXES'
  | 'INSURANCE'
  | 'MANAGEMENT'
  | 'OTHER';

export interface Expense {
  id: string;
  property: CodedRef;
  category: ExpenseCategory;
  name: string;
  payee: string | null;
  reference: string | null;
  amount: number;
  incurredOn: string;
  receipt: { id: string; contentType: string; size: number } | null;
  recurringExpenseId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpense {
  id: string;
  property: CodedRef;
  category: ExpenseCategory;
  name: string;
  payee: string | null;
  amount: number;
  /** 1–12. */
  everyMonths: number;
  /** 1–28. */
  dayOfMonth: number;
  nextDue: string;
  endDate: string | null;
  status: RecordStatus;
  createdAt: string;
}
