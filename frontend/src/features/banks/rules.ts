import { MAX_UPLOAD_BYTES, formatBytes } from '../../lib/files';
import { checkShortcode } from '../payments/rules';
import type { DarajaEnvironment } from '../payments/types';
import type { DateFormat, StatementImportResult, StatementMapping } from './types';

/**
 * Pure rules for the bank screens (phase 10): the statement column mapping, the statement
 * file, how an import reads, and the M-Pesa B2C payout account form. No React, so each is
 * tested on its own.
 */

// ---------------------------------------------------------------- statement file

/** Bank exports are CSV. Some browsers report them as Excel or plain text, so the name decides. */
export function checkStatementFile(file: { name: string; type: string; size: number }): string | null {
  const csvName = /\.csv$/i.test(file.name);
  const csvType = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', ''].includes(file.type.toLowerCase());
  if (!csvName || !csvType) return 'Choose a CSV file. In your bank’s internet banking, export the statement as CSV (not PDF or Excel).';
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return `That file (${formatBytes(file.size)}) is over the 10 MB limit. Export a shorter date range.`;
  return null;
}

// ---------------------------------------------------------------- sample rows

/** The preview's sample as rows of cells in header order, whether rows came as arrays or objects. */
export function sampleRows(headers: readonly string[], sample: readonly unknown[] | null | undefined): string[][] {
  if (!Array.isArray(sample)) return [];
  const cell = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  return sample.map((row) => {
    if (Array.isArray(row)) return headers.map((_h, i) => cell(row[i]));
    if (row && typeof row === 'object') return headers.map((h) => cell((row as Record<string, unknown>)[h]));
    return headers.map(() => '');
  });
}

// ---------------------------------------------------------------- column mapping

export type AmountMode = 'AMOUNT' | 'CREDIT';

/** The mapping form: every value is a header name, or '' for none. */
export interface MappingDraft {
  date: string;
  dateFormat: DateFormat;
  amountMode: AmountMode;
  amount: string;
  credit: string;
  debit: string;
  reference: string;
  transactionId: string;
  payer: string;
}

export type MappingField = Exclude<keyof MappingDraft, 'dateFormat' | 'amountMode'>;

/**
 * The form from the server's mapping (sent, saved on the channel, or guessed). A column
 * the file doesn't have is dropped. Kenyan banks mostly print DD/MM/YYYY, so that is the
 * default when nothing says otherwise.
 */
export function draftFromMapping(mapping: Partial<StatementMapping> | null | undefined, headers: readonly string[]): MappingDraft {
  const m = mapping ?? {};
  const has = (value: string | undefined) => (value && headers.includes(value) ? value : '');
  const credit = has(m.credit);
  const amount = has(m.amount);
  return {
    date: has(m.date),
    dateFormat: m.dateFormat === 'YMD' ? 'YMD' : 'DMY',
    amountMode: credit && !amount ? 'CREDIT' : 'AMOUNT',
    amount,
    credit,
    debit: has(m.debit),
    reference: has(m.reference),
    transactionId: has(m.transactionId),
    payer: has(m.payer),
  };
}

export type CheckedMapping =
  | { ok: true; mapping: StatementMapping }
  | { ok: false; errors: Partial<Record<MappingField, string>> };

/**
 * The mapping to send, or what is missing. Date, amount (or credit) and narrative are
 * needed, each from its own column; a column the file doesn't have is refused.
 */
export function checkMapping(draft: MappingDraft, headers: readonly string[]): CheckedMapping {
  const errors: Partial<Record<MappingField, string>> = {};
  const known = (field: MappingField) => {
    const value = draft[field];
    if (value && !headers.includes(value)) errors[field] = 'This column isn’t in the file. Choose again.';
  };
  const used: MappingField[] = draft.amountMode === 'AMOUNT'
    ? ['date', 'amount', 'reference', 'transactionId', 'payer']
    : ['date', 'credit', 'debit', 'reference', 'transactionId', 'payer'];
  used.forEach(known);

  if (!draft.date) errors.date = 'Choose the column with the date.';
  if (draft.amountMode === 'AMOUNT') {
    if (!draft.amount) errors.amount = 'Choose the column with the amount.';
  } else if (!draft.credit) {
    errors.credit = 'Choose the column with money paid in.';
  }
  if (!draft.reference) errors.reference = 'Choose the column with the narrative or reference.';

  // The core columns must each be different: a date can't also be the amount.
  const core: MappingField[] = draft.amountMode === 'AMOUNT' ? ['date', 'amount', 'reference'] : ['date', 'credit', 'debit', 'reference'];
  const seen = new Map<string, MappingField>();
  for (const field of core) {
    const value = draft[field];
    if (!value || errors[field]) continue;
    if (seen.has(value)) errors[field] = 'This column is already used above. Choose a different one.';
    else seen.set(value, field);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const mapping: StatementMapping = { date: draft.date, dateFormat: draft.dateFormat, reference: draft.reference };
  if (draft.amountMode === 'AMOUNT') mapping.amount = draft.amount;
  else {
    mapping.credit = draft.credit;
    if (draft.debit) mapping.debit = draft.debit;
  }
  if (draft.transactionId) mapping.transactionId = draft.transactionId;
  if (draft.payer) mapping.payer = draft.payer;
  return { ok: true, mapping };
}

/** The mapping as the API's form field: JSON with a fixed key order, so equal mappings compare equal. */
export function mappingJson(mapping: StatementMapping): string {
  const order: (keyof StatementMapping)[] = ['date', 'dateFormat', 'amount', 'credit', 'debit', 'reference', 'transactionId', 'payer'];
  const out: Record<string, string> = {};
  for (const key of order) {
    const value = mapping[key];
    if (value) out[key] = value;
  }
  return JSON.stringify(out);
}

// ---------------------------------------------------------------- import results

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What an import did, as short lines: new money matched to tenants, new money waiting on
 * Reconciliation, rows already imported before, rows that weren't credits.
 */
export function describeImport(r: Pick<StatementImportResult, 'rows' | 'credits' | 'created' | 'duplicates' | 'matched'>): {
  lines: string[];
  unmatched: number;
} {
  const unmatched = Math.max(0, r.created - r.matched);
  const skipped = Math.max(0, r.rows - r.credits);
  const lines = [
    `${plural(r.rows, 'row', 'rows')} read, ${plural(r.credits, 'credit', 'credits')} (money paid in).`,
    r.created === 0
      ? 'Nothing new: every credit was already in KodiHub.'
      : `${plural(r.created, 'new credit', 'new credits')}: ${r.matched} matched to tenants and recorded as payments${unmatched ? `, ${unmatched} waiting on Reconciliation` : ''}.`,
  ];
  if (r.duplicates > 0) lines.push(`${plural(r.duplicates, 'credit was', 'credits were')} imported before, so ${r.duplicates === 1 ? 'it was' : 'they were'} left alone.`);
  if (skipped > 0) lines.push(`${plural(skipped, 'row', 'rows')} skipped (money paid out, or not a transaction).`);
  return { lines, unmatched };
}

// ---------------------------------------------------------------- B2C payout account

export interface PayoutAccountDraft {
  name: string;
  shortcode: string;
  environment: DarajaEnvironment | '';
  consumerKey: string;
  consumerSecret: string;
  initiatorName: string;
  securityCredential: string;
}

export interface PayoutAccountBody {
  name: string;
  shortcode: string;
  environment: DarajaEnvironment;
  initiatorName: string;
  consumerKey?: string;
  consumerSecret?: string;
  securityCredential?: string;
}

export type CheckedPayoutAccount =
  | { ok: true; body: PayoutAccountBody }
  | { ok: false; errors: Partial<Record<keyof PayoutAccountDraft, string>> };

const SECRETS = ['consumerKey', 'consumerSecret', 'securityCredential'] as const;

/**
 * The B2C account form. Keys are write-only: the first set-up needs all three; after that
 * a blank one keeps what is saved, so only what changed is sent.
 */
export function checkPayoutAccount(draft: PayoutAccountDraft, configured: boolean): CheckedPayoutAccount {
  const errors: Partial<Record<keyof PayoutAccountDraft, string>> = {};
  const name = draft.name.trim();
  const shortcode = draft.shortcode.trim();
  const initiatorName = draft.initiatorName.trim();
  if (!name) errors.name = 'Name the account, e.g. Landlord payouts.';
  else if (name.length > 80) errors.name = 'Keep the name to 80 characters.';
  const shortcodeError = checkShortcode(shortcode);
  if (shortcodeError) errors.shortcode = shortcodeError;
  if (draft.environment !== 'SANDBOX' && draft.environment !== 'PRODUCTION') errors.environment = 'Choose sandbox or production.';
  if (!initiatorName) errors.initiatorName = 'Enter the initiator (API operator) name from the M-Pesa org portal.';
  else if (/\s/.test(initiatorName)) errors.initiatorName = 'The initiator name has no spaces.';

  const secrets: Partial<Record<(typeof SECRETS)[number], string>> = {};
  for (const field of SECRETS) {
    const value = draft[field].trim();
    if (!value) {
      if (!configured) {
        errors[field] = field === 'securityCredential'
          ? 'Paste the security credential generated on the Daraja portal.'
          : `Paste the consumer ${field === 'consumerKey' ? 'key' : 'secret'} from your Daraja app.`;
      }
    } else if (/\s/.test(value)) {
      errors[field] = 'This has no spaces. Copy it again from the Daraja portal.';
    } else {
      secrets[field] = value;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: { name, shortcode, environment: draft.environment as DarajaEnvironment, initiatorName, ...secrets },
  };
}
