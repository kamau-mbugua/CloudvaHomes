import { isDay } from '../../lib/dates';
import { parseAmount } from '../../lib/money';
import type { AttachmentDraft } from '../uploads/api';
import { CATEGORY_KEYS } from './labels';
import type { ExpenseCategory } from './types';

/**
 * Pure expense rules: checking the forms, building what is sent, the voided filter and
 * describing a recurring schedule. No React, so each is tested on its own.
 */

// ---------------------------------------------------------------- expense form

export const EXPENSE_FIELDS = ['propertyId', 'category', 'name', 'amount', 'incurredOn', 'payee', 'reference', 'receiptUploadId'] as const;
export type ExpenseField = (typeof EXPENSE_FIELDS)[number];
export type ExpenseValues = Record<Exclude<ExpenseField, 'receiptUploadId'>, string>;

export interface ExpenseBody {
  propertyId: string;
  category: ExpenseCategory;
  name: string;
  amount: number;
  incurredOn: string;
  payee: string | null;
  reference: string | null;
  /** Absent = leave the receipt as it is; null = remove it. */
  receiptUploadId?: string | null;
}

export function isCategory(value: string): value is ExpenseCategory {
  return (CATEGORY_KEYS as string[]).includes(value);
}

/**
 * The receipt part of a save. Only a change is sent: re-sending the id of the receipt
 * already attached would be refused (an upload attaches once).
 */
export function receiptChange(draft: AttachmentDraft): { receiptUploadId?: string | null } {
  if (draft.kind === 'new') return { receiptUploadId: draft.upload.id };
  if (draft.kind === 'remove') return { receiptUploadId: null };
  return {};
}

/** Checks the expense form; `today` is Nairobi's `YYYY-MM-DD` (an expense can't be in the future). */
export function checkExpense(
  values: ExpenseValues,
  today: string,
): { ok: true; body: Omit<ExpenseBody, 'receiptUploadId'> } | { ok: false; errors: Partial<Record<ExpenseField, string>> } {
  const errors: Partial<Record<ExpenseField, string>> = {};
  if (!values.propertyId) errors.propertyId = 'Choose the property.';
  if (!isCategory(values.category)) errors.category = 'Choose a category.';
  const name = values.name.trim();
  if (!name) errors.name = 'Say what it was for, e.g. “Gate motor repair”.';
  else if (name.length > 200) errors.name = 'Keep it under 200 characters.';
  const amount = parseAmount(values.amount);
  if (!amount.ok) errors.amount = amount.error;
  else if (amount.minor <= 0) errors.amount = 'The amount must be more than zero.';
  if (!isDay(values.incurredOn)) errors.incurredOn = 'Choose the date it was paid or incurred.';
  else if (values.incurredOn > today) errors.incurredOn = 'The date can’t be in the future.';

  if (Object.keys(errors).length > 0 || !amount.ok || !isCategory(values.category)) return { ok: false, errors };
  return {
    ok: true,
    body: {
      propertyId: values.propertyId,
      category: values.category,
      name,
      amount: amount.minor,
      incurredOn: values.incurredOn,
      payee: values.payee.trim() || null,
      reference: values.reference.trim() || null,
    },
  };
}

// ---------------------------------------------------------------- recurring form

export const RECURRING_FIELDS = [
  'propertyId', 'category', 'name', 'payee', 'amount', 'everyMonths', 'dayOfMonth', 'startDate', 'endDate', 'status',
] as const;
export type RecurringField = (typeof RECURRING_FIELDS)[number];
export type RecurringValues = Record<RecurringField, string>;

export interface RecurringBody {
  propertyId?: string;
  category: ExpenseCategory;
  name: string;
  payee: string | null;
  amount: number;
  everyMonths: number;
  /** Not sent: the API takes the day from `startDate` (capped at 28). */
  startDate?: string;
  endDate: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

function wholeIn(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= min && n <= max ? n : null;
}

/**
 * Checks the recurring-expense form. A new one needs its property and start date; an
 * existing one keeps both (its next due date moves on by itself) and may change status.
 */
export function checkRecurring(
  values: RecurringValues,
  { editing }: { editing: boolean },
): { ok: true; body: RecurringBody } | { ok: false; errors: Partial<Record<RecurringField, string>> } {
  const errors: Partial<Record<RecurringField, string>> = {};
  if (!editing && !values.propertyId) errors.propertyId = 'Choose the property.';
  if (!isCategory(values.category)) errors.category = 'Choose a category.';
  const name = values.name.trim();
  if (!name) errors.name = 'Say what it is, e.g. “Night guard”.';
  else if (name.length > 200) errors.name = 'Keep it under 200 characters.';
  const amount = parseAmount(values.amount);
  if (!amount.ok) errors.amount = amount.error;
  else if (amount.minor <= 0) errors.amount = 'The amount must be more than zero.';
  const every = wholeIn(values.everyMonths, 1, 12);
  if (every === null) errors.everyMonths = 'Every 1 to 12 months.';
  // A new one repeats on its start date's day (capped at 28); an existing one keeps its day.
  const day = editing ? wholeIn(values.dayOfMonth, 1, 28) : repeatDay(values.startDate);
  if (!editing && !isDay(values.startDate)) errors.startDate = 'Choose the date of the first one.';
  else if (day === null) errors.dayOfMonth = 'A day from 1 to 28, so it falls in every month.';
  if (values.endDate && !isDay(values.endDate)) errors.endDate = 'Choose a date, or leave it empty.';
  else if (values.endDate && !editing && isDay(values.startDate) && values.endDate < values.startDate) {
    errors.endDate = 'The end date can’t be before the start.';
  }

  if (Object.keys(errors).length > 0 || !amount.ok || every === null || day === null || !isCategory(values.category)) {
    return { ok: false, errors };
  }
  const body: RecurringBody = {
    category: values.category,
    name,
    payee: values.payee.trim() || null,
    amount: amount.minor,
    everyMonths: every,
    endDate: values.endDate || null,
  };
  if (editing) body.status = values.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  else {
    body.propertyId = values.propertyId;
    body.startDate = values.startDate;
  }
  return { ok: true, body };
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** "Monthly on the 5th", "Every 3 months on the 1st", "Yearly on the 28th". */
export function describeSchedule(everyMonths: number, dayOfMonth: number): string {
  const day = `on the ${ordinal(dayOfMonth)}`;
  if (everyMonths === 1) return `Monthly ${day}`;
  if (everyMonths === 12) return `Yearly ${day}`;
  return `Every ${everyMonths} months ${day}`;
}

// ---------------------------------------------------------------- list filter

/**
 * The voided filter in the address ('' | 'only') → the API's `voided` parameter. The API
 * lists either current expenses (the default) or only voided ones, never both at once.
 */
export type VoidedFilter = '' | 'only';

export function readVoidedFilter(value: string): VoidedFilter {
  return value === 'only' ? value : '';
}

export function voidedQuery(filter: VoidedFilter): 'true' | undefined {
  return filter === 'only' ? 'true' : undefined;
}

/** The day of the month a recurring expense starting on `startDate` repeats on: its day, capped at 28. */
export function repeatDay(startDate: string): number | null {
  if (!isDay(startDate)) return null;
  return Math.min(28, Number(startDate.slice(8, 10)));
}

/** The created count from `POST /recurring-expenses/run`, whatever the wrapper. */
export function readCreated(body: unknown): number {
  const inner = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
  const created = inner && typeof inner === 'object' ? (inner as { created?: unknown }).created : undefined;
  return typeof created === 'number' && Number.isFinite(created) ? created : 0;
}
