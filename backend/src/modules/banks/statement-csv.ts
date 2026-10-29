import { createHash } from 'node:crypto';
import { kesToCents } from '../mpesa/daraja.js';

/** Pure CSV bank-statement reading: no I/O, so every rule is unit-tested. */

/** Which header is which. Values are header names as they appear in the file. */
export interface StatementMapping {
  date: string;
  /** YMD = 2026-10-05 / 2026/10/05; DMY = 05/10/2026 / 05-10-2026 / 05.10.2026. */
  dateFormat: 'YMD' | 'DMY';
  /** One signed amount column (credits positive)… */
  amount?: string;
  /** …or separate credit (money in) and optional debit columns. */
  credit?: string;
  debit?: string;
  reference: string;
  transactionId?: string;
  payer?: string;
}

export interface StatementCredit {
  row: number; // 1-based data row (header excluded)
  occurredAt: string; // YYYY-MM-DD
  amount: bigint; // cents, > 0
  reference: string;
  transactionId: string | null;
  payer: string | null;
  providerRef: string; // dedup key
}

export const MAX_STATEMENT_ROWS = 5000;

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF/LF, a UTF-8 BOM; blank lines skipped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

const pick = (headers: string[], ...patterns: RegExp[]) =>
  headers.find((h) => patterns.some((p) => p.test(h)));

/** A first guess at the mapping from common bank-export header names. */
export function guessMapping(
  headers: string[],
  sampleDates: string[] = [],
): Partial<StatementMapping> {
  const credit = pick(headers, /^(credit|credits|money in|deposits?|cr)( amount)?$/i, /credit/i);
  const amount = credit ? undefined : pick(headers, /^amount$/i, /amount/i);
  const date = pick(headers, /^(transaction |value |posting |txn )?date$/i, /date/i);
  return {
    ...(date ? { date } : {}),
    dateFormat: sampleDates.some((d) => /^\d{4}[-/]/.test(d)) ? 'YMD' : 'DMY',
    ...(credit ? { credit } : {}),
    ...(credit
      ? optional('debit', pick(headers, /^(debit|debits|money out|withdrawals?|dr)( amount)?$/i))
      : {}),
    ...(amount ? { amount } : {}),
    ...optional(
      'reference',
      pick(
        headers,
        /narrat/i,
        /description/i,
        /details/i,
        /particulars/i,
        /^reference$/i,
        /remarks?/i,
      ),
    ),
    ...optional(
      'transactionId',
      pick(
        headers,
        /(transaction|txn|trans)[ _-]?(id|ref|reference|no|number)/i,
        /^ref(erence)? no/i,
      ),
    ),
    ...optional('payer', pick(headers, /payer|depositor|sender|from/i)),
  };
}

function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Record<K, string>) : {};
}

/** "05/10/2026" (DMY) or "2026-10-05" (YMD) → "2026-10-05"; times after the date are ignored. */
export function parseStatementDate(raw: string, format: 'YMD' | 'DMY'): string | null {
  const text = raw.trim().split(/[ T]/)[0]!;
  const m =
    format === 'YMD'
      ? /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text)
      : /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (!m) return null;
  const [y, mo, d] = format === 'YMD' ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const iso = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** "1,234.50" / "KES 1,234.50" / "(1,234.50)" / "-1234.5" → cents (negative for debits); null if not a number. */
export function parseStatementAmount(raw: string): bigint | null {
  let text = raw
    .trim()
    .replace(/^KES\s*/i, '')
    .replace(/,/g, '')
    .replace(/\s/g, '');
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = kesToCents(text);
  return negative ? -cents : cents;
}

/**
 * Credits from a parsed CSV (first row = headers). Debits and zero rows are skipped; rows
 * that can't be read are reported, never guessed.
 */
export function readStatement(rows: string[][], mapping: StatementMapping) {
  const [headers = [], ...data] = rows;
  const col = (name: string | undefined) => (name ? headers.indexOf(name) : -1);
  const errors: { row: number; message: string }[] = [];
  const missing: string[] = [];
  if (col(mapping.date) < 0) missing.push('date');
  if (col(mapping.reference) < 0) missing.push('reference');
  if (mapping.amount ? col(mapping.amount) < 0 : col(mapping.credit) < 0) {
    missing.push(mapping.amount ? 'amount' : 'credit (or amount)');
  }
  if (mapping.debit && col(mapping.debit) < 0) missing.push('debit');
  if (missing.length) {
    return {
      credits: [],
      skipped: 0,
      errors: [{ row: 0, message: `Choose the ${missing.join(', ')} column` }],
    };
  }
  if (data.length > MAX_STATEMENT_ROWS) {
    return {
      credits: [],
      skipped: 0,
      errors: [
        {
          row: 0,
          message: `A statement can have at most ${MAX_STATEMENT_ROWS} rows; split the file`,
        },
      ],
    };
  }
  const iDate = col(mapping.date);
  const iRef = col(mapping.reference);
  const iAmount = col(mapping.amount);
  const iCredit = col(mapping.credit);
  const iTxn = col(mapping.transactionId);
  const iPayer = col(mapping.payer);
  const credits: StatementCredit[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  data.forEach((r, index) => {
    const row = index + 1;
    const cell = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    let amount: bigint | null;
    if (iAmount >= 0) {
      amount = parseStatementAmount(cell(iAmount));
      if (amount === null)
        return errors.push({ row, message: `Amount “${cell(iAmount)}” isn’t a number` });
    } else {
      const creditText = cell(iCredit);
      if (!creditText) {
        skipped++;
        return;
      }
      amount = parseStatementAmount(creditText);
      if (amount === null)
        return errors.push({ row, message: `Credit “${creditText}” isn’t a number` });
    }
    if (amount <= 0n) {
      skipped++;
      return;
    }
    const occurredAt = parseStatementDate(cell(iDate), mapping.dateFormat);
    if (!occurredAt)
      return errors.push({
        row,
        message: `Date “${cell(iDate)}” isn’t a ${mapping.dateFormat === 'YMD' ? 'year-month-day' : 'day/month/year'} date`,
      });
    const reference = cell(iRef);
    const transactionId = cell(iTxn) || null;
    let providerRef: string;
    if (transactionId) providerRef = transactionId.toUpperCase().slice(0, 100);
    else {
      const base = createHash('sha256')
        .update(`${occurredAt}|${amount}|${reference.toUpperCase()}`)
        .digest('hex')
        .slice(0, 24);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      providerRef = `STMT-${base}#${n}`;
    }
    credits.push({
      row,
      occurredAt,
      amount,
      reference,
      transactionId,
      payer: cell(iPayer) || null,
      providerRef,
    });
  });
  return { credits, skipped, errors };
}
