import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { billingErrorMessage } from './api';
import { INVOICE_STATUS } from './labels';
import { labelFor } from '../portfolio/labels';
import {
  activeMoveInCharges, canCreditInvoice, canVoidInvoice, checkAdhocLines, checkCreditAmount, checkDueDays, draftTotal,
  moveInChargeAmount, moveInChargeRule, readRunPreview, readRunResult, splitRowErrors, uploadRowErrors,
} from './rules';

const apiError = (code: string, status = 409, details: { field: string; message: string }[] = []) =>
  new ApiError({ status, code, message: `server says ${code}`, details });

describe('move-in charges', () => {
  it('uses the fixed amount, or months × rent', () => {
    expect(moveInChargeAmount({ amount: 150000, rentMonths: null }, 2500000)).toBe(150000);
    expect(moveInChargeAmount({ amount: null, rentMonths: 2 }, 2500000)).toBe(5000000);
    expect(moveInChargeAmount({ amount: null, rentMonths: 2 }, null)).toBeNull();
    expect(moveInChargeAmount({ amount: 0, rentMonths: null }, null)).toBe(0);
  });

  it('describes the rule', () => {
    expect(moveInChargeRule({ amount: null, rentMonths: 1 })).toBe('1 × monthly rent');
    expect(moveInChargeRule({ amount: null, rentMonths: 2 })).toBe('2 × monthly rent');
    expect(moveInChargeRule({ amount: 150000, rentMonths: null })).toBe('KES 1,500.00');
  });

  it('keeps only active charges', () => {
    expect(activeMoveInCharges([{ status: 'ACTIVE' }, { status: 'INACTIVE' }])).toEqual([{ status: 'ACTIVE' }]);
  });
});

describe('invoice actions', () => {
  it('voids only with nothing paid or credited', () => {
    expect(canVoidInvoice({ status: 'ISSUED', amountPaid: 0, creditedAmount: 0 })).toBe(true);
    expect(canVoidInvoice({ status: 'PARTIALLY_PAID', amountPaid: 100, creditedAmount: 0 })).toBe(false);
    expect(canVoidInvoice({ status: 'ISSUED', amountPaid: 0, creditedAmount: 100 })).toBe(false);
    expect(canVoidInvoice({ status: 'VOID', amountPaid: 0, creditedAmount: 0 })).toBe(false);
  });

  it('credits only a live invoice with a balance', () => {
    expect(canCreditInvoice({ status: 'ISSUED', balance: 1 })).toBe(true);
    expect(canCreditInvoice({ status: 'PAID', balance: 0 })).toBe(false);
    expect(canCreditInvoice({ status: 'VOID', balance: 500 })).toBe(false);
  });

  it('checks a credit amount against the balance', () => {
    expect(checkCreditAmount('500', 50000)).toEqual({ ok: true, minor: 50000 });
    expect(checkCreditAmount('500.01', 50000)).toEqual({ ok: false, error: 'At most the balance, KES 500.00.' });
    expect(checkCreditAmount('0', 50000)).toEqual({ ok: false, error: 'Enter an amount above zero.' });
    expect(checkCreditAmount('abc', 50000).ok).toBe(false);
  });

  it('labels every status, unknown ones raw', () => {
    expect(labelFor(INVOICE_STATUS, 'PARTIALLY_PAID').label).toBe('Part paid');
    expect(labelFor(INVOICE_STATUS, 'DRAFT')).toEqual({ label: 'DRAFT', tone: 'ad__badge--off' });
  });
});

describe('checkAdhocLines', () => {
  it('skips blank rows and totals the rest', () => {
    const result = checkAdhocLines([
      { description: 'Broken window', amount: '3,500' },
      { description: '', amount: '' },
      { description: ' Lock change ', amount: '1200.50' },
    ]);
    expect(result).toEqual({
      ok: true,
      lines: [{ description: 'Broken window', amount: 350000 }, { description: 'Lock change', amount: 120050 }],
      total: 470050,
    });
  });

  it('points at the half-filled row', () => {
    const result = checkAdhocLines([{ description: 'Repair', amount: '' }, { description: '', amount: '100' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].amount).toBe('Enter an amount.');
      expect(result.errors[1].description).toBe('Describe the charge.');
    }
  });

  it('needs at least one line, amounts above zero, at most 20', () => {
    expect(checkAdhocLines([{ description: '', amount: '' }])).toMatchObject({ ok: false, general: 'Add at least one line.' });
    const zero = checkAdhocLines([{ description: 'x', amount: '0' }]);
    expect(zero.ok ? null : zero.errors[0].amount).toBe('Above zero.');
    const many = Array.from({ length: 21 }, () => ({ description: 'x', amount: '1' }));
    expect(checkAdhocLines(many)).toMatchObject({ ok: false, general: 'At most 20 lines.' });
  });

  it('keeps a running total of what parses', () => {
    expect(draftTotal([{ description: '', amount: '10' }, { description: '', amount: 'x' }, { description: '', amount: '' }])).toBe(1000);
  });
});

describe('checkDueDays', () => {
  it('accepts 0–60 whole days', () => {
    expect(checkDueDays('0')).toEqual({ ok: true, days: 0 });
    expect(checkDueDays(' 60 ')).toEqual({ ok: true, days: 60 });
    expect(checkDueDays('61')).toEqual({ ok: false, error: 'At most 60 days.' });
    expect(checkDueDays('7.5').ok).toBe(false);
    expect(checkDueDays('-1').ok).toBe(false);
    expect(checkDueDays('').ok).toBe(false);
  });
});

describe('run endpoints', () => {
  const item = { tenancyId: 't1', total: 100, lines: [], missingReadings: [] };

  it('reads the preview with or without a wrapper object', () => {
    expect(readRunPreview({ data: [item] })).toEqual({ items: [item], date: null, period: null });
    expect(readRunPreview({ data: { date: '2026-10-27', period: '2026-10', items: [item] } }))
      .toEqual({ items: [item], date: '2026-10-27', period: '2026-10' });
    expect(readRunPreview({ data: null })).toEqual({ items: [], date: null, period: null });
    expect(readRunPreview({ data: { date: '2026-10-27', period: '2026-10', total: 100, items: [item] } }).items).toEqual([item]);
  });

  it('reads the run result, counting ids when created is missing', () => {
    expect(readRunResult({ data: { date: '2026-10-27', period: '2026-10', created: 2, invoiceIds: ['a', 'b'] } }))
      .toEqual({ date: '2026-10-27', period: '2026-10', created: 2, invoiceIds: ['a', 'b'] });
    expect(readRunResult({ invoiceIds: ['a'] })).toMatchObject({ created: 1 });
  });
});

describe('splitRowErrors', () => {
  it('puts row details beside their row, by dot or bracket index', () => {
    const error = apiError('VALIDATION_FAILED', 422, [
      { field: 'readings.1.current', message: 'Must be at least previous.' },
      { field: 'readings[0].previous', message: 'Bad.' },
      { field: 'readings.1.note', message: 'Second message for row 1 is dropped.' },
    ]);
    expect(splitRowErrors(error, 'readings', ['m-a', 'm-b'], billingErrorMessage)).toEqual({
      byRow: { 'm-b': 'Must be at least previous.', 'm-a': 'Bad.' },
      byField: {},
      general: null,
    });
  });

  it('keeps named fields apart and the rest as the general message', () => {
    const error = apiError('VALIDATION_FAILED', 422, [
      { field: 'dueDate', message: 'In the past.' },
      { field: 'period', message: 'Bad month.' },
    ]);
    const out = splitRowErrors(error, 'lines', [], billingErrorMessage, ['dueDate']);
    expect(out.byField).toEqual({ dueDate: 'In the past.' });
    expect(out.general).toBe('server says VALIDATION_FAILED period: Bad month.');
  });

  it('describes any other error', () => {
    expect(splitRowErrors(apiError('ALREADY_BILLED'), 'entries', [], billingErrorMessage).general)
      .toMatch(/already on an invoice/);
  });
});

describe('billingErrorMessage', () => {
  it('words every new billing code', () => {
    for (const code of ['ALREADY_BILLED', 'ALREADY_INVOICED', 'NO_MOVE_IN_CHARGES', 'INVOICE_SETTLED', 'INVOICE_VOID',
      'SERIAL_TAKEN', 'METER_EXISTS', 'TENANCY_INVOICED', 'IN_USE', 'NAME_TAKEN']) {
      expect(billingErrorMessage(apiError(code))).not.toBe(`server says ${code}`);
    }
  });

  it('takes a screen-specific override', () => {
    expect(billingErrorMessage(apiError('IN_USE'), { IN_USE: 'Has readings.' })).toBe('Has readings.');
  });

  it('falls back to the portfolio wording, then the server message', () => {
    expect(billingErrorMessage(apiError('UNIT_OCCUPIED'))).toMatch(/current tenant/);
    expect(billingErrorMessage(apiError('SOMETHING_NEW'))).toBe('server says SOMETHING_NEW');
  });
});

describe('uploadRowErrors', () => {
  it('puts a refused photo beside its row', () => {
    const error = new ApiError({ status: 422, code: 'UPLOAD_INVALID', message: 'bad upload', details: [{ field: 'readings[1].photoUploadId', message: 'used' }] });
    expect(uploadRowErrors(error, 'readings', ['m-1', 'm-2'], 'Retake it.')).toEqual({ 'm-2': 'Retake it.' });
  });

  it('is null for anything else', () => {
    expect(uploadRowErrors(apiError('VALIDATION_FAILED', 422), 'readings', ['m-1'], 'x')).toBeNull();
    expect(uploadRowErrors(new ApiError({ status: 422, code: 'UPLOAD_INVALID', message: 'x' }), 'readings', ['m-1'], 'x')).toBeNull();
  });
});
