import { ApiError, api } from '../../lib/api/client';
import { csvFilename, saveBlob } from '../../lib/files';
import { paymentsErrorMessage } from '../payments/api';
import { uploadErrorMessage } from '../uploads/api';

/**
 * Query keys, the CSV download and error messages for the expense screens. Expenses feed
 * the reports, so every expense change also refreshes `reportKeys`.
 */
export const keys = {
  expenses: ['expenses'] as const,
  recurring: ['recurring-expenses'] as const,
};

/** Shared with the reports screens, which read expenses into P&L and the dashboard. */
export const reportKeys = ['reports'] as const;

export interface ExpenseFilter {
  q?: string;
  propertyId?: string;
  category?: string;
  from?: string;
  to?: string;
  voided?: string;
}

/** The filtered list as CSV (every matching row, not just this page), saved as `expenses-<range>.csv`. */
export async function downloadExpensesCsv(filter: ExpenseFilter): Promise<void> {
  const blob = await api.blob('/expenses', { ...filter, format: 'csv' });
  saveBlob(blob, csvFilename('expenses', { from: filter.from, to: filter.to }), 'text/csv');
}

/**
 * Plain-English messages for the expense and upload error codes. `overrides` rewords a
 * code for one screen. Anything else falls through to the payment (billing, portfolio)
 * messages.
 */
export function expensesErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    switch (error.code) {
      case 'EXPENSE_VOID':
        return 'This expense has been voided, so it can’t be changed.';
      case 'IN_USE':
        return 'This recurring expense has already created expenses, so it can’t be deleted. Mark it inactive instead.';
      default:
        break;
    }
  }
  return uploadErrorMessage(error, (e) => paymentsErrorMessage(e));
}
