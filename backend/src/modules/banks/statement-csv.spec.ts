import { describe, expect, it } from 'vitest';
import { narrativeRef } from '../mpesa/matching.js';
import {
  guessMapping,
  parseCsv,
  parseStatementAmount,
  parseStatementDate,
  readStatement,
  type StatementMapping,
} from './statement-csv.js';

describe('parseCsv', () => {
  it('handles a BOM, quotes, doubled quotes, CRLF and blank lines', () => {
    const rows = parseCsv(
      '﻿Date,Narrative,Credit\r\n05/10/2026,"RENT, T00001 ""A1""",1500\r\n\r\n06/10/2026,X,\n',
    );
    expect(rows).toEqual([
      ['Date', 'Narrative', 'Credit'],
      ['05/10/2026', 'RENT, T00001 "A1"', '1500'],
      ['06/10/2026', 'X', ''],
    ]);
  });
});

describe('dates and amounts', () => {
  it('reads both date orders and rejects impossible dates', () => {
    expect(parseStatementDate('05/10/2026', 'DMY')).toBe('2026-10-05');
    expect(parseStatementDate('5-1-2026 14:03', 'DMY')).toBe('2026-01-05');
    expect(parseStatementDate('2026/10/05', 'YMD')).toBe('2026-10-05');
    expect(parseStatementDate('31/02/2026', 'DMY')).toBeNull();
    expect(parseStatementDate('2026-10-05', 'DMY')).toBeNull();
  });
  it('reads amounts with commas, currency and brackets', () => {
    expect(parseStatementAmount('1,234.50')).toBe(123450n);
    expect(parseStatementAmount('KES 20,000')).toBe(2000000n);
    expect(parseStatementAmount('(500.00)')).toBe(-50000n);
    expect(parseStatementAmount('-75.5')).toBe(-7550n);
    expect(parseStatementAmount('12.345')).toBeNull();
    expect(parseStatementAmount('')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('finds common bank-export headers', () => {
    expect(
      guessMapping(['Transaction Date', 'Narrative', 'Debit', 'Credit', 'Balance'], ['05/10/2026']),
    ).toEqual({
      date: 'Transaction Date',
      dateFormat: 'DMY',
      credit: 'Credit',
      debit: 'Debit',
      reference: 'Narrative',
    });
    expect(
      guessMapping(['Date', 'Description', 'Amount', 'Transaction ID'], ['2026-10-05']),
    ).toMatchObject({
      amount: 'Amount',
      dateFormat: 'YMD',
      transactionId: 'Transaction ID',
    });
  });
});

describe('readStatement', () => {
  const mapping: StatementMapping = {
    date: 'Date',
    dateFormat: 'DMY',
    credit: 'Credit',
    debit: 'Debit',
    reference: 'Narrative',
  };
  const csv = (body: string) => parseCsv(`Date,Narrative,Debit,Credit\n${body}`);

  it('keeps credits, skips debits, reports bad rows, and keys identical rows apart', () => {
    const r = readStatement(
      csv(
        [
          '05/10/2026,T00001 rent,,"20,000.00"',
          '05/10/2026,Bank charges,35.00,',
          '05/10/2026,T00002,,abc',
          '32/10/2026,T00003,,100',
          '06/10/2026,CASH DEP,,500',
          '06/10/2026,CASH DEP,,500',
        ].join('\n'),
      ),
      mapping,
    );
    expect(r.credits.map((c) => [c.row, c.occurredAt, c.amount])).toEqual([
      [1, '2026-10-05', 2000000n],
      [5, '2026-10-06', 50000n],
      [6, '2026-10-06', 50000n],
    ]);
    expect(r.skipped).toBe(1);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4]);
    const [, a, b] = r.credits;
    expect(a!.providerRef).not.toBe(b!.providerRef);
    // Same file again → same keys (so a re-import adds nothing).
    const again = readStatement(csv('06/10/2026,CASH DEP,,500\n06/10/2026,CASH DEP,,500'), mapping);
    expect(again.credits.map((c) => c.providerRef)).toEqual([a!.providerRef, b!.providerRef]);
  });

  it('uses the transaction id as the key when there is one, and a signed amount column', () => {
    const rows = parseCsv(
      'Date,Ref,Amount,Txn ID\n2026-10-05,INV-2026-000004,1500,ft2610050001\n2026-10-05,Fee,-35,ft2',
    );
    const r = readStatement(rows, {
      date: 'Date',
      dateFormat: 'YMD',
      amount: 'Amount',
      reference: 'Ref',
      transactionId: 'Txn ID',
    });
    expect(r.credits).toHaveLength(1);
    expect(r.credits[0]).toMatchObject({ providerRef: 'FT2610050001', amount: 150000n });
    expect(r.skipped).toBe(1);
  });

  it('says which columns are missing', () => {
    const r = readStatement(csv(''), { ...mapping, reference: 'Nope' });
    expect(r.errors[0]!.message).toContain('reference');
  });
});

describe('narrativeRef', () => {
  it('finds tenant codes and invoice numbers in free text, and only those', () => {
    expect(narrativeRef('MPESA DEP T00012 RENT OCT')).toBe('T00012');
    expect(narrativeRef('payment for inv-2026-000123 thanks')).toBe('INV2026000123');
    expect(narrativeRef('INV 2026 000123')).toBe('INV2026000123');
    expect(narrativeRef('KLCA4')).toBe('KLCA4');
    expect(narrativeRef('RENT OCTOBER')).toBeNull();
    expect(narrativeRef('ACCT T000123456789X')).toBeNull();
    expect(narrativeRef(null)).toBeNull();
  });
});
