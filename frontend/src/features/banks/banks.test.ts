import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { banksErrorMessage } from './api';
import {
  checkMapping, checkPayoutAccount, checkStatementFile, describeImport, draftFromMapping, mappingJson, sampleRows,
} from './rules';
import type { MappingDraft, PayoutAccountDraft } from './rules';

/** Synthetic data only: tenants T0000x, invoices INV-2026-00000x. */

const HEADERS = ['Txn Date', 'Narrative', 'Debit', 'Credit', 'Bank Ref', 'Balance'];

const draft = (over: Partial<MappingDraft> = {}): MappingDraft => ({
  date: 'Txn Date', dateFormat: 'DMY', amountMode: 'CREDIT', amount: '', credit: 'Credit', debit: 'Debit',
  reference: 'Narrative', transactionId: 'Bank Ref', payer: '', ...over,
});

describe('checkStatementFile', () => {
  it('takes a CSV, whatever type the browser reports', () => {
    expect(checkStatementFile({ name: 'statement.csv', type: 'text/csv', size: 2048 })).toBeNull();
    expect(checkStatementFile({ name: 'STATEMENT.CSV', type: 'application/vnd.ms-excel', size: 2048 })).toBeNull();
    expect(checkStatementFile({ name: 'statement.csv', type: '', size: 2048 })).toBeNull();
  });
  it('refuses a PDF or Excel file, an empty file and one over 10 MB', () => {
    expect(checkStatementFile({ name: 'statement.pdf', type: 'application/pdf', size: 2048 })).toMatch(/CSV/);
    expect(checkStatementFile({ name: 'statement.xlsx', type: 'application/vnd.ms-excel', size: 2048 })).toMatch(/CSV/);
    expect(checkStatementFile({ name: 'statement.csv', type: 'text/csv', size: 0 })).toMatch(/empty/);
    expect(checkStatementFile({ name: 'statement.csv', type: 'text/csv', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});

describe('sampleRows', () => {
  it('reads rows given as arrays', () => {
    expect(sampleRows(['a', 'b'], [['1', 2], ['3']])).toEqual([['1', '2'], ['3', '']]);
  });
  it('reads rows given as objects keyed by header, in header order', () => {
    expect(sampleRows(['a', 'b'], [{ b: 'x', a: null }])).toEqual([['', 'x']]);
  });
  it('copes with nothing', () => {
    expect(sampleRows(['a'], undefined)).toEqual([]);
  });
});

describe('draftFromMapping', () => {
  it('takes the server’s mapping and drops columns the file doesn’t have', () => {
    const d = draftFromMapping({ date: 'Txn Date', dateFormat: 'YMD', credit: 'Credit', reference: 'Missing' }, HEADERS);
    expect(d).toMatchObject({ date: 'Txn Date', dateFormat: 'YMD', amountMode: 'CREDIT', credit: 'Credit', reference: '' });
  });
  it('defaults to day-first dates and one amount column', () => {
    expect(draftFromMapping(null, HEADERS)).toMatchObject({ dateFormat: 'DMY', amountMode: 'AMOUNT', date: '' });
  });
});

describe('checkMapping', () => {
  it('builds a credit/debit mapping with the optional columns', () => {
    expect(checkMapping(draft(), HEADERS)).toEqual({
      ok: true,
      mapping: { date: 'Txn Date', dateFormat: 'DMY', credit: 'Credit', debit: 'Debit', reference: 'Narrative', transactionId: 'Bank Ref' },
    });
  });
  it('builds a single-amount mapping and leaves credit/debit out', () => {
    const result = checkMapping(draft({ amountMode: 'AMOUNT', amount: 'Credit', credit: 'Gone', transactionId: '' }), HEADERS);
    expect(result).toEqual({ ok: true, mapping: { date: 'Txn Date', dateFormat: 'DMY', amount: 'Credit', reference: 'Narrative' } });
  });
  it('asks for the date, the amount (or credit) and the narrative', () => {
    const result = checkMapping(draft({ date: '', credit: '', reference: '' }), HEADERS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['credit', 'date', 'reference']);
    const single = checkMapping(draft({ amountMode: 'AMOUNT' }), HEADERS);
    expect(single.ok).toBe(false);
    if (!single.ok) expect(single.errors.amount).toMatch(/amount/);
  });
  it('refuses one column used for two things, and a column not in the file', () => {
    const twice = checkMapping(draft({ reference: 'Txn Date' }), HEADERS);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.errors.reference).toMatch(/already used/);
    const unknown = checkMapping(draft({ payer: 'Nope' }), HEADERS);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors.payer).toMatch(/isn’t in the file/);
  });
});

describe('mappingJson', () => {
  it('is the same for the same mapping whatever the key order, and leaves out blanks', () => {
    const a = mappingJson({ reference: 'N', date: 'D', dateFormat: 'DMY', amount: 'A', payer: '' });
    const b = mappingJson({ date: 'D', amount: 'A', dateFormat: 'DMY', reference: 'N' });
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual({ date: 'D', dateFormat: 'DMY', amount: 'A', reference: 'N' });
  });
});

describe('describeImport', () => {
  it('says what was new, matched, waiting and skipped', () => {
    const { lines, unmatched } = describeImport({ rows: 40, credits: 12, created: 10, duplicates: 2, matched: 7 });
    expect(unmatched).toBe(3);
    expect(lines).toEqual([
      '40 rows read, 12 credits (money paid in).',
      '10 new credits: 7 matched to tenants and recorded as payments, 3 waiting on Reconciliation.',
      '2 credits were imported before, so they were left alone.',
      '28 rows skipped (money paid out, or not a transaction).',
    ]);
  });
  it('says plainly when a re-import added nothing', () => {
    const { lines, unmatched } = describeImport({ rows: 5, credits: 5, created: 0, duplicates: 5, matched: 0 });
    expect(unmatched).toBe(0);
    expect(lines[1]).toBe('Nothing new: every credit was already in KodiHub.');
  });
});

describe('checkPayoutAccount', () => {
  const full: PayoutAccountDraft = {
    name: ' Landlord payouts ', shortcode: '600000', environment: 'SANDBOX', consumerKey: 'key', consumerSecret: 'secret',
    initiatorName: 'testapi', securityCredential: 'Q2VydA==',
  };
  it('needs every key on the first set-up', () => {
    const result = checkPayoutAccount({ ...full, consumerKey: '', securityCredential: '' }, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['consumerKey', 'securityCredential']);
  });
  it('sends everything, trimmed, on the first set-up', () => {
    expect(checkPayoutAccount(full, false)).toEqual({
      ok: true,
      body: {
        name: 'Landlord payouts', shortcode: '600000', environment: 'SANDBOX', initiatorName: 'testapi',
        consumerKey: 'key', consumerSecret: 'secret', securityCredential: 'Q2VydA==',
      },
    });
  });
  it('keeps saved keys when left blank on a change', () => {
    const result = checkPayoutAccount({ ...full, consumerKey: '', consumerSecret: '', securityCredential: '' }, true);
    expect(result).toEqual({ ok: true, body: { name: 'Landlord payouts', shortcode: '600000', environment: 'SANDBOX', initiatorName: 'testapi' } });
  });
  it('checks the shortcode, environment, initiator and stray spaces', () => {
    const result = checkPayoutAccount({ ...full, shortcode: '12', environment: '', initiatorName: 'two words', consumerSecret: 'a b' }, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['consumerSecret', 'environment', 'initiatorName', 'shortcode']);
  });
});

describe('banksErrorMessage', () => {
  const err = (code: string, message = '') => new ApiError({ status: 422, code, message });
  it('words the bank codes', () => {
    expect(banksErrorMessage(err('NOT_BANK_CHANNEL'))).toMatch(/Only bank account/);
    expect(banksErrorMessage(err('NO_PAYOUT_ACCOUNT'))).toMatch(/Settings → Payouts/);
    expect(banksErrorMessage(err('CSV_INVALID', 'No header row.'))).toBe('KodiHub couldn’t read this file: No header row.');
    expect(banksErrorMessage(err('CSV_INVALID'))).toMatch(/Export the statement/);
  });
  it('falls through to the M-Pesa and payment messages', () => {
    expect(banksErrorMessage(err('DARAJA_ERROR', 'Invalid credentials'))).toMatch(/Invalid credentials/);
  });
});
