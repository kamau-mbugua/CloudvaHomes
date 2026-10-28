import type { Label } from '../portfolio/labels';
import type { ExpenseCategory } from './types';

/** Words for the fixed expense categories, in the order the API lists them. */
export const EXPENSE_CATEGORY: Record<ExpenseCategory, Label> = {
  REPAIRS: { label: 'Repairs & maintenance', tone: 'ad__badge--off' },
  UTILITIES: { label: 'Utilities', tone: 'ad__badge--off' },
  SECURITY: { label: 'Security', tone: 'ad__badge--off' },
  CLEANING: { label: 'Cleaning', tone: 'ad__badge--off' },
  SALARIES: { label: 'Salaries & wages', tone: 'ad__badge--off' },
  TAXES: { label: 'Taxes & levies', tone: 'ad__badge--off' },
  INSURANCE: { label: 'Insurance', tone: 'ad__badge--off' },
  MANAGEMENT: { label: 'Management fees', tone: 'ad__badge--off' },
  OTHER: { label: 'Other', tone: 'ad__badge--off' },
};

export const CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[];

export const VOIDED: Label = { label: 'Void', tone: 'ad__badge--off' };
export const RECURRING: Label = { label: 'Recurring', tone: 'ad__badge--info' };

export function categoryText(category: string): string {
  return (EXPENSE_CATEGORY as Record<string, Label | undefined>)[category]?.label ?? category;
}
