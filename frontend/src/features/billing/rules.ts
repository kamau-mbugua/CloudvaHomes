import { ApiError } from '../../lib/api/client';
import { formatKES, parseAmount } from '../../lib/money';
import type { Invoice, MoveInCharge, RunPreviewItem, RunResult } from './types';

/**
 * Pure billing rules the screens share: move-in charge amounts, which invoice actions are
 * open, one-off invoice lines, and reading the run endpoints' answers. No React, so each
 * is tested on its own.
 */

// ---------------------------------------------------------------- move-in charges

/**
 * What a move-in charge comes to for a given monthly rent: its fixed amount, or
 * `rentMonths` × rent. Null when it depends on a rent that is not known (yet).
 */
export function moveInChargeAmount(charge: Pick<MoveInCharge, 'amount' | 'rentMonths'>, rentMinor: number | null): number | null {
  if (charge.amount !== null && charge.amount !== undefined) return charge.amount;
  if (charge.rentMonths === null || charge.rentMonths === undefined || rentMinor === null) return null;
  return charge.rentMonths * rentMinor;
}

/** "2 × monthly rent" or "KES 1,500.00". */
export function moveInChargeRule(charge: Pick<MoveInCharge, 'amount' | 'rentMonths'>): string {
  if (charge.amount !== null && charge.amount !== undefined) return formatKES(charge.amount);
  const months = charge.rentMonths ?? 0;
  return months === 1 ? '1 × monthly rent' : `${months} × monthly rent`;
}

/** Only active charges are billed. */
export function activeMoveInCharges<T extends Pick<MoveInCharge, 'status'>>(charges: T[]): T[] {
  return charges.filter((c) => c.status === 'ACTIVE');
}

// ---------------------------------------------------------------- invoice actions

/** Void is only for an invoice with nothing paid and nothing credited. */
export function canVoidInvoice(invoice: Pick<Invoice, 'status' | 'amountPaid' | 'creditedAmount'>): boolean {
  return invoice.status !== 'VOID' && invoice.amountPaid === 0 && invoice.creditedAmount === 0;
}

/** A credit note needs something left to credit. */
export function canCreditInvoice(invoice: Pick<Invoice, 'status' | 'balance'>): boolean {
  return invoice.status !== 'VOID' && invoice.balance > 0;
}

/** Validates a credit-note amount against the balance. */
export function checkCreditAmount(input: string, balance: number): { ok: true; minor: number } | { ok: false; error: string } {
  const parsed = parseAmount(input);
  if (!parsed.ok) return parsed;
  if (parsed.minor <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  if (parsed.minor > balance) return { ok: false, error: `At most the balance, ${formatKES(balance)}.` };
  return parsed;
}

// ---------------------------------------------------------------- one-off invoices

export const MAX_ADHOC_LINES = 20;

export interface DraftLine {
  description: string;
  amount: string;
}

export type CheckedLines =
  | { ok: true; lines: { description: string; amount: number }[]; total: number }
  | { ok: false; errors: { description?: string; amount?: string }[]; general?: string };

/**
 * The lines of a one-off invoice: rows left completely blank are skipped; every other row
 * needs a description and an amount above zero. One to twenty lines.
 */
export function checkAdhocLines(drafts: DraftLine[]): CheckedLines {
  const errors: { description?: string; amount?: string }[] = drafts.map(() => ({}));
  const lines: { description: string; amount: number }[] = [];
  let bad = false;

  drafts.forEach((draft, i) => {
    const description = draft.description.trim();
    const amountText = draft.amount.trim();
    if (!description && !amountText) return;

    if (!description) { errors[i].description = 'Describe the charge.'; bad = true; }
    const amount = parseAmount(amountText);
    if (!amount.ok) { errors[i].amount = amount.error; bad = true; }
    else if (amount.minor <= 0) { errors[i].amount = 'Above zero.'; bad = true; }
    if (description && amount.ok && amount.minor > 0) lines.push({ description, amount: amount.minor });
  });

  if (bad) return { ok: false, errors };
  if (lines.length === 0) return { ok: false, errors, general: 'Add at least one line.' };
  if (lines.length > MAX_ADHOC_LINES) return { ok: false, errors, general: `At most ${MAX_ADHOC_LINES} lines.` };
  return { ok: true, lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

/** Running total of the rows that parse, for the sheet's footer while typing. */
export function draftTotal(drafts: DraftLine[]): number {
  return drafts.reduce((sum, d) => {
    const parsed = d.amount.trim() ? parseAmount(d.amount) : null;
    return parsed?.ok ? sum + parsed.minor : sum;
  }, 0);
}

// ---------------------------------------------------------------- organisation setting

/** "Invoice due after N days": a whole number 0–60. */
export function checkDueDays(input: string): { ok: true; days: number } | { ok: false; error: string } {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: 'A whole number of days, 0 to 60.' };
  const days = Number(text);
  if (days > 60) return { ok: false, error: 'At most 60 days.' };
  return { ok: true, days };
}

// ---------------------------------------------------------------- run endpoints

function unwrap(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in body) return (body as { data: unknown }).data;
  return body;
}

/**
 * The preview answer. The contract fixes each item's shape but not the wrapper, so accept
 * `{ data: Item[] }`, `{ data: { items, date?, period? } }` or the bare forms.
 */
export function readRunPreview(body: unknown): { items: RunPreviewItem[]; date: string | null; period: string | null } {
  const inner = unwrap(body);
  if (Array.isArray(inner)) return { items: inner as RunPreviewItem[], date: null, period: null };
  if (inner && typeof inner === 'object') {
    const o = inner as { items?: unknown; date?: unknown; period?: unknown };
    return {
      items: Array.isArray(o.items) ? (o.items as RunPreviewItem[]) : [],
      date: typeof o.date === 'string' ? o.date : null,
      period: typeof o.period === 'string' ? o.period : null,
    };
  }
  return { items: [], date: null, period: null };
}

/** `{ date, period, created, invoiceIds }`, with or without the data envelope. */
export function readRunResult(body: unknown): RunResult {
  const o = (unwrap(body) ?? {}) as Partial<RunResult>;
  const invoiceIds = Array.isArray(o.invoiceIds) ? o.invoiceIds : [];
  return {
    date: o.date ?? '',
    period: o.period ?? '',
    created: typeof o.created === 'number' ? o.created : invoiceIds.length,
    invoiceIds,
  };
}

/** Sum of integer minor units. */
export function sumMinor(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

// ---------------------------------------------------------------- row errors

/**
 * A failed save of many rows at once (readings, variable amounts, invoice lines): a 422
 * detail on `readings.3.current` or `readings[3].current` goes beside row 3, named by
 * `rowIds[3]`; details on no row, and every other error, become the general message.
 */
export function splitRowErrors(
  error: unknown,
  arrayName: string,
  rowIds: readonly string[],
  describe: (error: unknown) => string,
  /** Top-level fields the form shows beside their own inputs (`tenancyId`, `dueDate`). */
  fields: readonly string[] = [],
): { byRow: Record<string, string>; byField: Record<string, string>; general: string | null } {
  const byRow: Record<string, string> = {};
  const byField: Record<string, string> = {};
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') {
    return { byRow, byField, general: error ? describe(error) : null };
  }

  const pattern = new RegExp(`^${arrayName}(?:\\.|\\[)(\\d+)\\]?`);
  const leftover: string[] = [];
  for (const { field, message } of error.details) {
    const match = pattern.exec(field);
    const id = match ? rowIds[Number(match[1])] : undefined;
    if (id !== undefined) {
      if (!(id in byRow)) byRow[id] = message;
    } else if (fields.includes(field)) {
      if (!(field in byField)) byField[field] = message;
    } else {
      leftover.push(`${field}: ${message}`);
    }
  }
  const general = leftover.length > 0 || error.details.length === 0 ? [error.message, ...leftover].join(' ') : null;
  return { byRow, byField, general };
}

/**
 * A refused attachment on a row (`422 UPLOAD_INVALID` naming `readings[2].photoUploadId`)
 * → a message beside that row. Null when the error is not that.
 */
export function uploadRowErrors(
  error: unknown,
  arrayName: string,
  rowIds: readonly string[],
  message: string,
): Record<string, string> | null {
  if (!(error instanceof ApiError) || error.code !== 'UPLOAD_INVALID') return null;
  const pattern = new RegExp(`^${arrayName}(?:\\.|\\[)(\\d+)\\]?`);
  const byRow: Record<string, string> = {};
  for (const { field } of error.details) {
    const match = pattern.exec(field);
    const id = match ? rowIds[Number(match[1])] : undefined;
    if (id !== undefined) byRow[id] = message;
  }
  return Object.keys(byRow).length > 0 ? byRow : null;
}
