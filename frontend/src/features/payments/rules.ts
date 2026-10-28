import { ApiError } from '../../lib/api/client';
import { formatDay, isDay } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { splitRowErrors } from '../billing/rules';
import { labelFor } from '../portfolio/labels';
import { PAYMENT_METHOD } from './labels';
import type { ChannelKind, OpenInvoice, Payment, PaymentChannel, StatementEntry } from './types';

/**
 * Pure payment rules the screens share: the suggested allocation, checking typed
 * allocations, deposit settlement limits, statement totals and reading the answers.
 * No React, and money only as integer cents, so each is tested on its own.
 */

// ---------------------------------------------------------------- envelopes

/** `{ data: T }` or a bare `T` — the contract fixes the shapes, not always the wrapper. */
export function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) return (body as { data: T }).data;
  return body as T;
}

/** A list answer as an array, whatever the wrapper. */
export function unwrapList<T>(body: unknown): T[] {
  const inner = unwrap<unknown>(body);
  return Array.isArray(inner) ? (inner as T[]) : [];
}

// ---------------------------------------------------------------- allocation

export interface AllocationLine {
  invoiceId: string;
  amount: number;
}

/** Oldest due date first, then oldest issue date — the order the server allocates in. */
export function oldestFirst<T extends Pick<OpenInvoice, 'dueDate' | 'issueDate'>>(invoices: readonly T[]): T[] {
  return invoices
    .map((invoice, index) => ({ invoice, index }))
    .sort((a, b) => (
      a.invoice.dueDate.localeCompare(b.invoice.dueDate)
      || a.invoice.issueDate.localeCompare(b.invoice.issueDate)
      || a.index - b.index
    ))
    .map(({ invoice }) => invoice);
}

/**
 * The suggested allocation of `amount` cents: each open invoice in turn, oldest due first,
 * gets as much of its balance as is left. `preferId` (an invoice the sheet was opened
 * from) is paid first. Every invoice gets a line, 0 where nothing reaches it, in the
 * order the money was handed out.
 */
export function planAllocations(
  amount: number,
  invoices: readonly Pick<OpenInvoice, 'id' | 'dueDate' | 'issueDate' | 'balance'>[],
  preferId?: string,
): AllocationLine[] {
  const ordered = oldestFirst(invoices);
  const preferred = preferId ? ordered.filter((i) => i.id === preferId) : [];
  const queue = [...preferred, ...ordered.filter((i) => i.id !== preferId)];
  let left = Math.max(0, Math.trunc(amount));
  return queue.map((invoice) => {
    const share = Math.min(left, Math.max(0, invoice.balance));
    left -= share;
    return { invoiceId: invoice.id, amount: share };
  });
}

/** What stays with the tenant as credit: the amount less what was allocated, never below 0. */
export function creditLeft(amount: number, allocated: number): number {
  return Math.max(0, amount - allocated);
}

/** Running total of the allocation inputs that parse, for the sheet while typing. */
export function allocationDraftTotal(drafts: Record<string, string>): number {
  return Object.values(drafts).reduce((sum, text) => {
    const parsed = text.trim() ? parseAmount(text) : null;
    return parsed?.ok ? sum + parsed.minor : sum;
  }, 0);
}

export type CheckedAllocations =
  | { ok: true; allocations: AllocationLine[]; total: number }
  | { ok: false; errors: Record<string, string>; general?: string };

/**
 * Typed allocations (invoice id → text) against each invoice's balance and the payment
 * amount. Blank means nothing for that invoice. Only lines above zero are returned, in
 * the invoices' order; each is at most its balance and together at most the amount.
 */
export function checkAllocations(
  drafts: Record<string, string>,
  invoices: readonly Pick<OpenInvoice, 'id' | 'number' | 'balance'>[],
  amount: number,
): CheckedAllocations {
  const errors: Record<string, string> = {};
  const allocations: AllocationLine[] = [];
  for (const invoice of invoices) {
    const text = (drafts[invoice.id] ?? '').trim();
    if (!text) continue;
    const parsed = parseAmount(text);
    if (!parsed.ok) { errors[invoice.id] = parsed.error; continue; }
    if (parsed.minor > invoice.balance) { errors[invoice.id] = `At most the balance, ${formatKES(invoice.balance)}.`; continue; }
    if (parsed.minor > 0) allocations.push({ invoiceId: invoice.id, amount: parsed.minor });
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const total = allocations.reduce((sum, a) => sum + a.amount, 0);
  if (total > amount) {
    return { ok: false, errors, general: `The allocations add up to ${formatKES(total)}, more than the ${formatKES(amount)} received.` };
  }
  return { ok: true, allocations, total };
}

// ---------------------------------------------------------------- recording

/** A payment amount: above zero. */
export function checkPaymentAmount(input: string): { ok: true; minor: number } | { ok: false; error: string } {
  const parsed = parseAmount(input);
  if (!parsed.ok) return parsed;
  if (parsed.minor <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  return parsed;
}

/** The day the money came in: a real day, not after today (Nairobi). */
export function checkReceivedAt(day: string, today: string): string | null {
  if (!isDay(day)) return 'Choose the day the money was received.';
  if (day > today) return 'The money can’t have been received in the future.';
  return null;
}

const isMpesa = (kind: ChannelKind | null | undefined) => kind === 'MPESA_PAYBILL' || kind === 'MPESA_TILL';

/**
 * The reference as it will be saved: M-Pesa codes are upper case without spaces (staff
 * often type them from a phone in lower case); others are trimmed.
 */
export function normaliseReference(kind: ChannelKind | null | undefined, input: string): string {
  const text = input.trim();
  return isMpesa(kind) ? text.replace(/\s+/g, '').toUpperCase() : text;
}

/** M-Pesa and cheque payments need their reference — it is what stops a double entry. */
export function checkReference(kind: ChannelKind | null | undefined, input: string): string | null {
  const text = normaliseReference(kind, input);
  if (isMpesa(kind) && !text) return 'Enter the M-Pesa code from the message.';
  if (isMpesa(kind) && !/^[A-Z0-9]{6,20}$/.test(text)) return 'An M-Pesa code is letters and digits only, e.g. SJR4XK2L9P.';
  if (kind === 'CHEQUE' && !text) return 'Enter the cheque number.';
  return null;
}

/** Channels a payment can be recorded on: active ones, by name. */
export function activeChannels<T extends Pick<PaymentChannel, 'status' | 'name'>>(channels: readonly T[]): T[] {
  return channels.filter((c) => c.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- reversal

/** "M-Pesa paybill · Main paybill", or "From deposit". */
export function methodText(payment: Pick<Payment, 'method' | 'channel'>): string {
  const method = labelFor(PAYMENT_METHOD, payment.method).label;
  return payment.channel ? `${method} · ${payment.channel.name}` : method;
}

export function isReversal(payment: Pick<Payment, 'amount' | 'reversesId'>): boolean {
  return Boolean(payment.reversesId) || payment.amount < 0;
}

/** Only an original payment that has not been reversed yet can be reversed. */
export function canReverse(payment: Pick<Payment, 'amount' | 'reversesId' | 'reversedBy'>): boolean {
  return !isReversal(payment) && !payment.reversedBy;
}

// ---------------------------------------------------------------- statement

/** The debit and credit columns added up. Closing = opening + debits − credits. */
export function statementTotals(entries: readonly Pick<StatementEntry, 'debit' | 'credit'>[]): { debit: number; credit: number } {
  return entries.reduce<{ debit: number; credit: number }>(
    (sum, e) => ({ debit: sum.debit + (e.debit ?? 0), credit: sum.credit + (e.credit ?? 0) }),
    { debit: 0, credit: 0 },
  );
}

/** From/to for a statement: each optional, a real day, and from not after to. */
export function checkStatementRange(from: string, to: string): string | null {
  if (from && !isDay(from)) return 'Choose a start date.';
  if (to && !isDay(to)) return 'Choose an end date.';
  if (from && to && from > to) return `The start date must be on or before ${formatDay(to)}.`;
  return null;
}

/** "KES 1,200.00 owed", "KES 300.00 in credit", "Nothing owed". Negative = in credit. */
export function describeBalance(balance: number): string {
  if (balance > 0) return `${formatKES(balance)} owed`;
  if (balance < 0) return `${formatKES(-balance)} in credit`;
  return 'Nothing owed';
}

// ---------------------------------------------------------------- deposit settlement

export interface SettlementDraft {
  applyAmount: string;
  refundAmount: string;
  refundReference: string;
}

export type CheckedSettlement =
  | { ok: true; applyAmount: number; refundAmount: number; refundReference?: string }
  | { ok: false; errors: Partial<Record<keyof SettlementDraft, string>>; general?: string };

/**
 * Settling a deposit at move-out: apply some to the tenant's invoices, refund some, or
 * both. Blank means none. Apply + refund ≤ held; a refund needs its reference.
 */
export function checkSettlement(draft: SettlementDraft, held: number): CheckedSettlement {
  const errors: Partial<Record<keyof SettlementDraft, string>> = {};
  const read = (field: 'applyAmount' | 'refundAmount'): number => {
    const text = draft[field].trim();
    if (!text) return 0;
    const parsed = parseAmount(text);
    if (!parsed.ok) { errors[field] = parsed.error; return 0; }
    if (parsed.minor > held) { errors[field] = `At most the ${formatKES(held)} held.`; return 0; }
    return parsed.minor;
  };
  const applyAmount = read('applyAmount');
  const refundAmount = read('refundAmount');
  const refundReference = draft.refundReference.trim();
  if (refundAmount > 0 && !refundReference) errors.refundReference = 'Enter the M-Pesa code, cheque or transfer reference of the refund.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (applyAmount + refundAmount === 0) return { ok: false, errors, general: 'Enter an amount to apply, to refund, or both.' };
  if (applyAmount + refundAmount > held) {
    return { ok: false, errors, general: `Applied and refunded together come to ${formatKES(applyAmount + refundAmount)}, more than the ${formatKES(held)} held.` };
  }
  return { ok: true, applyAmount, refundAmount, refundReference: refundAmount > 0 ? refundReference : undefined };
}

// ---------------------------------------------------------------- channels

/** Which detail fields a channel kind has (and what they are called). */
export const CHANNEL_FIELDS: Record<ChannelKind, { field: 'shortcode' | 'bankName' | 'accountNumber' | 'accountName'; label: string; required: boolean; hint?: string }[]> = {
  MPESA_PAYBILL: [
    { field: 'shortcode', label: 'Paybill number', required: true, hint: '5 to 7 digits, e.g. 522522.' },
    { field: 'accountName', label: 'Account name', required: false, hint: 'Shown to tenants, e.g. the business name.' },
  ],
  MPESA_TILL: [
    { field: 'shortcode', label: 'Till number', required: true, hint: '5 to 7 digits.' },
    { field: 'accountName', label: 'Business name', required: false },
  ],
  BANK_ACCOUNT: [
    { field: 'bankName', label: 'Bank', required: true, hint: 'e.g. KCB, Equity, Co-op.' },
    { field: 'accountNumber', label: 'Account number', required: true },
    { field: 'accountName', label: 'Account name', required: false },
  ],
  CASH: [],
  CHEQUE: [
    { field: 'accountName', label: 'Payable to', required: false, hint: 'The name cheques are written to.' },
  ],
};

/** "Paybill 522522", "KCB · 1234567890", "" for cash. */
export function channelDetails(channel: Pick<PaymentChannel, 'kind' | 'shortcode' | 'bankName' | 'accountNumber' | 'accountName'>): string {
  switch (channel.kind) {
    case 'MPESA_PAYBILL':
      return channel.shortcode ? `Paybill ${channel.shortcode}` : '';
    case 'MPESA_TILL':
      return channel.shortcode ? `Till ${channel.shortcode}` : '';
    case 'BANK_ACCOUNT':
      return [channel.bankName, channel.accountNumber].filter(Boolean).join(' · ');
    case 'CHEQUE':
      return channel.accountName ? `Payable to ${channel.accountName}` : '';
    default:
      return '';
  }
}

/** M-Pesa shortcodes are 5–7 digits. */
export function checkShortcode(input: string): string | null {
  return /^\d{5,7}$/.test(input.trim()) ? null : 'Enter 5 to 7 digits.';
}

// ---------------------------------------------------------------- errors

/**
 * A failed `POST /payments`: 422 details beside their inputs (`allocations[2].amount`
 * beside the invoice sent third), a conflict (`DUPLICATE_REFERENCE` → reference) beside
 * its field, the rest as the general message.
 */
export function splitPaymentError(
  error: unknown,
  sentInvoiceIds: readonly string[],
  fields: readonly string[],
  conflicts: Record<string, string>,
  describe: (error: unknown) => string,
): { byInvoice: Record<string, string>; byField: Record<string, string>; general: string | null } {
  if (error instanceof ApiError && conflicts[error.code] && fields.includes(conflicts[error.code])) {
    return { byInvoice: {}, byField: { [conflicts[error.code]]: describe(error) }, general: null };
  }
  const { byRow, byField, general } = splitRowErrors(error, 'allocations', sentInvoiceIds, describe, fields);
  return { byInvoice: byRow, byField, general };
}
