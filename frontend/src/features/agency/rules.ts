import { isDay } from '../../lib/dates';
import { formatKES, minorToInput, parseAmount } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { normaliseKenyanPhone } from '../mpesa/rules';
import type {
  Agreement, CollectionMode, CommissionBasis, CommissionableLine, LedgerBucket, LedgerEntry, PayoutMethod, PersonRef,
  Remittance,
} from './types';

/**
 * Pure agency-accounting rules: commission rates, agreement and payout forms, running
 * balances, how a balance reads, what a remittance allows. No React, money only as
 * integer cents, so each is tested on its own.
 */

// ---------------------------------------------------------------- commission rate

export type ParsedBps = { ok: true; bps: number } | { ok: false; error: string };

/** "10" → 1000 bps, "7.5" → 750, "12.25" → 1225. Above 0, at most 100, two decimals. */
export function parsePercent(input: string): ParsedBps {
  const text = input.trim().replace(/%$/, '').trim();
  if (!text) return { ok: false, error: 'Enter the commission rate.' };
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(text) ?? /^()\.(\d{1,2})$/.exec(text);
  if (!match) {
    return /^\d*\.\d{3,}$/.test(text)
      ? { ok: false, error: 'Use at most two decimal places, e.g. 7.25.' }
      : { ok: false, error: 'Enter a percentage like 10 or 7.5.' };
  }
  const bps = Number(match[1] || '0') * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (bps <= 0) return { ok: false, error: 'The rate must be above 0%.' };
  if (bps > 10_000) return { ok: false, error: 'The rate can’t be more than 100%.' };
  return { ok: true, bps };
}

/** 1000 → "10", 750 → "7.5", 1225 → "12.25" — for a rate input and for display. */
export function bpsToPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = String(Math.abs(bps % 100)).padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** "10% of collected", "8% of invoiced", "KES 5,000.00 a month". */
export function describeRate(a: Pick<Agreement, 'commissionBasis' | 'commissionBps' | 'fixedAmount'>): string {
  if (a.commissionBasis === 'FIXED_MONTHLY') return `${formatKES(a.fixedAmount ?? 0)} a month`;
  const rate = `${bpsToPercent(a.commissionBps ?? 0)}%`;
  return a.commissionBasis === 'PERCENT_OF_INVOICED' ? `${rate} of invoiced` : `${rate} of collected`;
}

// ---------------------------------------------------------------- agreements

export type AgreementState = 'ACTIVE' | 'UPCOMING' | 'ENDED';

/** Not started yet, running, or ended — from the dates, with the API's `active` as the tie-break. */
export function agreementState(a: Pick<Agreement, 'startDate' | 'endDate' | 'active'>, today: string): AgreementState {
  if (a.startDate > today) return 'UPCOMING';
  if (a.endDate && a.endDate < today) return 'ENDED';
  return a.active ? 'ACTIVE' : 'ENDED';
}

export interface AgreementDraft {
  landlordId: string;
  /** Every property of the landlord, or only the ticked ones. */
  scope: 'ALL' | 'SOME';
  propertyIds: string[];
  commissionBasis: CommissionBasis;
  rate: string;
  fixedAmount: string;
  commissionableLines: CommissionableLine[];
  collection: CollectionMode;
  remittanceDay: string;
  deductExpenses: boolean;
  holdDeposits: boolean;
  startDate: string;
  endDate: string;
}

export type AgreementField =
  | 'landlordId' | 'propertyIds' | 'commissionBasis' | 'rate' | 'fixedAmount' | 'commissionableLines' | 'collection'
  | 'remittanceDay' | 'startDate' | 'endDate';

export interface AgreementBody {
  landlordId: string;
  propertyIds: string[];
  commissionBasis: CommissionBasis;
  commissionBps: number | null;
  fixedAmount: number | null;
  commissionableLines: CommissionableLine[];
  collection: CollectionMode;
  remittanceDay: number;
  deductExpenses: boolean;
  holdDeposits: boolean;
  startDate: string;
  endDate: string | null;
}

/** The plan's defaults: 10% of rent collected, agency collects, day 5, expenses deducted, deposits held. */
export function newAgreementDraft(today: string, landlordId = ''): AgreementDraft {
  return {
    landlordId,
    scope: 'ALL',
    propertyIds: [],
    commissionBasis: 'PERCENT_OF_COLLECTED',
    rate: '10',
    fixedAmount: '',
    commissionableLines: ['RENT'],
    collection: 'AGENCY_COLLECTS',
    remittanceDay: '5',
    deductExpenses: true,
    holdDeposits: true,
    startDate: `${today.slice(0, 7)}-01`,
    endDate: '',
  };
}

export function agreementToDraft(a: Agreement): AgreementDraft {
  return {
    landlordId: a.landlord.id,
    scope: a.propertyIds.length > 0 ? 'SOME' : 'ALL',
    propertyIds: a.propertyIds,
    commissionBasis: a.commissionBasis,
    rate: a.commissionBps ? bpsToPercent(a.commissionBps) : '',
    fixedAmount: a.fixedAmount ? minorToInput(a.fixedAmount) : '',
    commissionableLines: a.commissionableLines,
    collection: a.collection,
    remittanceDay: String(a.remittanceDay),
    deductExpenses: a.deductExpenses,
    holdDeposits: a.holdDeposits,
    startDate: a.startDate.slice(0, 10),
    endDate: a.endDate ? a.endDate.slice(0, 10) : '',
  };
}

export type CheckedAgreement =
  | { ok: true; body: AgreementBody }
  | { ok: false; errors: Partial<Record<AgreementField, string>> };

export function checkAgreement(d: AgreementDraft): CheckedAgreement {
  const errors: Partial<Record<AgreementField, string>> = {};
  let commissionBps: number | null = null;
  let fixedAmount: number | null = null;

  if (!d.landlordId) errors.landlordId = 'Choose the landlord.';
  if (d.scope === 'SOME' && d.propertyIds.length === 0) errors.propertyIds = 'Tick at least one property, or choose all of them.';

  if (d.commissionBasis === 'FIXED_MONTHLY') {
    const parsed = parseAmount(d.fixedAmount);
    if (!parsed.ok) errors.fixedAmount = parsed.error;
    else if (parsed.minor <= 0) errors.fixedAmount = 'Enter a fee above zero.';
    else fixedAmount = parsed.minor;
  } else {
    const parsed = parsePercent(d.rate);
    if (!parsed.ok) errors.rate = parsed.error;
    else commissionBps = parsed.bps;
    if (d.commissionableLines.length === 0) errors.commissionableLines = 'Tick what commission is charged on — usually rent.';
  }

  const day = Number(d.remittanceDay);
  if (!/^\d{1,2}$/.test(d.remittanceDay.trim()) || day < 1 || day > 28) {
    errors.remittanceDay = 'A day from 1 to 28, so every month has it.';
  }

  if (!isDay(d.startDate)) errors.startDate = 'Choose the day the agreement starts.';
  if (d.endDate && !isDay(d.endDate)) errors.endDate = 'Choose a real day, or leave it empty.';
  else if (d.endDate && isDay(d.startDate) && d.endDate < d.startDate) errors.endDate = 'The end can’t be before the start.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      landlordId: d.landlordId,
      propertyIds: d.scope === 'SOME' ? d.propertyIds : [],
      commissionBasis: d.commissionBasis,
      commissionBps,
      fixedAmount,
      // A fixed fee ignores the lines; the plan's default goes along so the field is never empty.
      commissionableLines: d.commissionableLines.length > 0 ? d.commissionableLines : ['RENT'],
      collection: d.collection,
      remittanceDay: day,
      deductExpenses: d.deductExpenses,
      holdDeposits: d.holdDeposits,
      startDate: d.startDate,
      endDate: d.endDate || null,
    },
  };
}

/** The end date for "End agreement": on or after the start, not before the agreement began. */
export function checkEndDate(endDate: string, a: Pick<Agreement, 'startDate'>): string | null {
  if (!isDay(endDate)) return 'Choose the last day of the agreement.';
  if (endDate < a.startDate.slice(0, 10)) return 'The end can’t be before the agreement started.';
  return null;
}

// ---------------------------------------------------------------- balances

/**
 * How a payable balance reads. + means the agency holds money for the landlord; − means
 * the landlord owes the agency (commission on rent they collected themselves, or
 * expenses bigger than collections). `owner` words it for the landlord.
 */
export function describePayable(balance: number, audience: 'agency' | 'owner' = 'agency'): string {
  if (balance > 0) return audience === 'owner' ? 'Due to you from the agency' : 'Agency owes the landlord';
  if (balance < 0) return audience === 'owner' ? 'You owe the agency' : 'Landlord owes the agency';
  return 'Nothing owed either way';
}

/**
 * Ledger rows with each row's bucket balance. The API's own `balance` wins. When it is
 * missing, the balances can still be worked back from `closing` (the bucket's balance
 * after the newest row) — but only when the rows are the newest ones, unfiltered by end
 * date; otherwise they stay null rather than show a wrong figure.
 */
export function withRunningBalance<T extends Pick<LedgerEntry, 'amount' | 'balance'>>(
  rows: readonly T[],
  closing: number | null,
): (T & { running: number | null })[] {
  let after: number | null = closing;
  return rows.map((row) => {
    const running = typeof row.balance === 'number' ? row.balance : after;
    after = running === null ? null : running - row.amount;
    return { ...row, running };
  });
}

// ---------------------------------------------------------------- adjustments

export interface AdjustmentDraft {
  bucket: LedgerBucket;
  /** `credit` adds to what is owed to the landlord; `debit` takes off. */
  direction: 'credit' | 'debit';
  amount: string;
  memo: string;
}

export type CheckedAdjustment =
  | { ok: true; body: { bucket: LedgerBucket; amount: number; memo: string } }
  | { ok: false; errors: Partial<Record<'amount' | 'memo', string>> };

export function checkAdjustment(d: AdjustmentDraft): CheckedAdjustment {
  const errors: Partial<Record<'amount' | 'memo', string>> = {};
  const parsed = parseAmount(d.amount);
  let amount = 0;
  if (!parsed.ok) errors.amount = parsed.error;
  else if (parsed.minor === 0) errors.amount = 'Enter an amount above zero.';
  else amount = d.direction === 'debit' ? -parsed.minor : parsed.minor;
  const memo = d.memo.trim();
  if (memo.length < 5) errors.memo = 'Say why, so the next person reading the ledger understands it.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { bucket: d.bucket, amount, memo } };
}

// ---------------------------------------------------------------- payout details

export interface PayoutDraft {
  method: PayoutMethod;
  bankName: string;
  branch: string;
  accountName: string;
  accountNumber: string;
  phone: string;
  payeeName: string;
}

export type PayoutField = Exclude<keyof PayoutDraft, 'method'>;

export const EMPTY_PAYOUT: Omit<PayoutDraft, 'method'> = {
  bankName: '', branch: '', accountName: '', accountNumber: '', phone: '', payeeName: '',
};

export type CheckedPayout =
  | { ok: true; body: Record<string, string> }
  | { ok: false; errors: Partial<Record<PayoutField, string>> };

/** Only the method's own fields are sent; the others never leave the form. */
export function checkPayout(d: PayoutDraft): CheckedPayout {
  const errors: Partial<Record<PayoutField, string>> = {};
  const body: Record<string, string> = { method: d.method };
  const need = (field: PayoutField, message: string) => {
    const value = d[field].trim();
    if (!value) errors[field] = message;
    else body[field] = value;
  };

  if (d.method === 'BANK') {
    need('bankName', 'Enter the bank, e.g. KCB or Equity.');
    if (d.branch.trim()) body.branch = d.branch.trim();
    need('accountName', 'Enter the name on the account.');
    const number = d.accountNumber.replace(/[\s-]/g, '');
    if (!number) errors.accountNumber = 'Enter the account number.';
    else if (!/^\d{6,20}$/.test(number)) errors.accountNumber = 'An account number is 6 to 20 digits.';
    else body.accountNumber = number;
  } else if (d.method === 'MPESA') {
    const phone = normaliseKenyanPhone(d.phone);
    if (!d.phone.trim()) errors.phone = 'Enter the M-Pesa phone number.';
    else if (!phone) errors.phone = 'Enter a Kenyan mobile number, e.g. 0712 345 678.';
    else body.phone = phone;
  } else {
    need('payeeName', 'Enter the name to write cheques to.');
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body };
}

// ---------------------------------------------------------------- remittances

/** "Grace Wanjiku", or a name field, or "Someone". */
export function personLabel(person: PersonRef | undefined): string {
  if (!person) return 'Someone';
  if (person.name) return person.name;
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Someone';
}

/** "KES 45,000.00 to the landlord" / "KES 2,000.00 from the landlord". */
export function describeNet(r: Pick<Remittance, 'net' | 'direction'>, audience: 'agency' | 'owner' = 'agency'): string {
  const amount = formatKES(Math.abs(r.net));
  const who = audience === 'owner' ? 'you' : 'the landlord';
  return r.direction === 'FROM_LANDLORD' ? `${amount} from ${who}` : `${amount} to ${who}`;
}

export interface RemittanceActions {
  approve: boolean;
  /** Why Approve is not offered to someone who otherwise could. */
  approveBlocked: string | null;
  pay: boolean;
  cancel: boolean;
}

/**
 * What the signed-in person may do with a remittance. Maker–checker: whoever drafted it
 * can't approve it (the server refuses with SAME_PERSON too).
 */
export function remittanceActions(
  r: Pick<Remittance, 'status' | 'draftedBy'>,
  me: { id: string; permissions: readonly string[] },
): RemittanceActions {
  const can = (p: string) => me.permissions.includes(p);
  const drafter = Boolean(r.draftedBy && r.draftedBy.id === me.id);
  const approvable = r.status === 'DRAFT' && can('remittances:approve');
  return {
    approve: approvable && !drafter,
    approveBlocked: approvable && drafter
      ? 'You drafted this remittance, so someone else has to approve it. Two people check every payout.'
      : null,
    pay: r.status === 'APPROVED' && can('remittances:pay'),
    cancel: (r.status === 'DRAFT' || r.status === 'APPROVED') && can('remittances:create'),
  };
}

export interface PaidDraft {
  method: PayoutMethod;
  reference: string;
  paidAt: string;
}

export type CheckedPaid =
  | { ok: true; body: { method: PayoutMethod; reference: string; paidAt: string } }
  | { ok: false; errors: Partial<Record<'reference' | 'paidAt', string>> };

export function checkPaid(d: PaidDraft, today: string): CheckedPaid {
  const errors: Partial<Record<'reference' | 'paidAt', string>> = {};
  const reference = d.method === 'MPESA' ? d.reference.replace(/\s+/g, '').toUpperCase() : d.reference.trim();
  if (!reference) {
    errors.reference = d.method === 'MPESA' ? 'Enter the M-Pesa code.' : d.method === 'CHEQUE' ? 'Enter the cheque number.' : 'Enter the bank transfer reference.';
  }
  if (!isDay(d.paidAt)) errors.paidAt = 'Choose the day it was paid.';
  else if (d.paidAt > today) errors.paidAt = 'It can’t have been paid in the future.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { method: d.method, reference, paidAt: d.paidAt } };
}

// ---------------------------------------------------------------- statements

export interface CollectionGroup {
  key: string;
  property: LedgerEntry['property'];
  rows: LedgerEntry[];
  total: number;
}

/**
 * A statement's collections per property, in the order they first appear, each with its
 * total: the payable-bucket COLLECTION entries (reversals arrive as negative ones).
 */
export function groupCollections(entries: readonly LedgerEntry[]): CollectionGroup[] {
  const groups = new Map<string, CollectionGroup>();
  for (const row of entries) {
    if (row.kind !== 'COLLECTION' || row.bucket !== 'PAYABLE') continue;
    const key = row.property?.id ?? '—';
    let group = groups.get(key);
    if (!group) {
      group = { key, property: row.property, rows: [], total: 0 };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.total += row.amount;
  }
  return [...groups.values()];
}

/** "Owner-statement-L0001-2026-01-to-2026-03.pdf". */
export function statementFilename(code: string | undefined, from: string, to: string): string {
  const span = from === to ? from : `${from}-to-${to}`;
  return `Owner-statement-${code || 'landlord'}-${span}.pdf`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "October 2026" or "Jan 2026 – Mar 2026". */
export function rangeText(from: string, to: string): string {
  return from === to ? formatPeriod(from, true) : `${formatPeriod(from)} – ${formatPeriod(to)}`;
}
