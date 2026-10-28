import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { uploadErrorMessage } from '../uploads/api';
import type { Upload } from '../uploads/api';
import { expensesErrorMessage } from './api';
import {
  checkExpense, checkRecurring, describeSchedule, ordinal, readCreated, readVoidedFilter, receiptChange, repeatDay, voidedQuery,
} from './rules';
import type { ExpenseValues, RecurringValues } from './rules';

/** Synthetic data only. */

const apiError = (code: string, status = 409) => new ApiError({ status, code, message: `server says ${code}` });
const TODAY = '2026-10-27';

const expense = (over: Partial<ExpenseValues> = {}): ExpenseValues => ({
  propertyId: 'p-1', category: 'REPAIRS', name: ' Gate motor repair ', amount: '4,500', incurredOn: '2026-10-20',
  payee: '  ', reference: ' TEST000001 ', ...over,
});

describe('checkExpense', () => {
  it('builds the body in cents with blanks as null', () => {
    expect(checkExpense(expense(), TODAY)).toEqual({
      ok: true,
      body: {
        propertyId: 'p-1', category: 'REPAIRS', name: 'Gate motor repair', amount: 450000, incurredOn: '2026-10-20',
        payee: null, reference: 'TEST000001',
      },
    });
  });

  it('allows today but not tomorrow', () => {
    expect(checkExpense(expense({ incurredOn: TODAY }), TODAY).ok).toBe(true);
    expect(checkExpense(expense({ incurredOn: '2026-10-28' }), TODAY))
      .toEqual({ ok: false, errors: { incurredOn: 'The date can’t be in the future.' } });
  });

  it('names every missing or bad field', () => {
    const result = checkExpense(expense({ propertyId: '', category: 'FOOD', name: '', amount: '0', incurredOn: '2026-02-30' }), TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['amount', 'category', 'incurredOn', 'name', 'propertyId']);
    expect(result.errors.amount).toBe('The amount must be more than zero.');
  });

  it('passes on amount parsing errors', () => {
    const result = checkExpense(expense({ amount: '12.345' }), TODAY);
    expect(result).toEqual({ ok: false, errors: { amount: 'Use at most two decimal places.' } });
  });
});

describe('receiptChange', () => {
  const upload: Upload = { id: 'up-1', purpose: 'EXPENSE_RECEIPT', contentType: 'image/png', size: 10, createdAt: '2026-10-27T00:00:00Z' };
  it('sends only a change', () => {
    expect(receiptChange({ kind: 'keep' })).toEqual({});
    expect(receiptChange({ kind: 'remove' })).toEqual({ receiptUploadId: null });
    expect(receiptChange({ kind: 'new', upload, file: new File(['x'], 'r.png') })).toEqual({ receiptUploadId: 'up-1' });
  });
});

const recurring = (over: Partial<RecurringValues> = {}): RecurringValues => ({
  propertyId: 'p-1', category: 'SECURITY', name: 'Night guard', payee: 'Sample Security Ltd', amount: '18000',
  everyMonths: '1', dayOfMonth: '1', startDate: '2026-11-05', endDate: '', status: 'ACTIVE', ...over,
});

describe('checkRecurring', () => {
  it('creates with the property and start date; the day comes from the start date', () => {
    expect(checkRecurring(recurring(), { editing: false })).toEqual({
      ok: true,
      body: {
        propertyId: 'p-1', startDate: '2026-11-05', category: 'SECURITY', name: 'Night guard', payee: 'Sample Security Ltd',
        amount: 1800000, everyMonths: 1, endDate: null,
      },
    });
  });

  it('edits without property or start date, with status', () => {
    const result = checkRecurring(recurring({ propertyId: '', startDate: '', status: 'INACTIVE', everyMonths: '3', endDate: '2027-06-30' }), { editing: true });
    expect(result).toMatchObject({ ok: true, body: { status: 'INACTIVE', everyMonths: 3, endDate: '2027-06-30' } });
    if (result.ok) {
      expect(result.body).not.toHaveProperty('propertyId');
      expect(result.body).not.toHaveProperty('startDate');
    }
  });

  it('refuses a bad interval, a missing start and an end before the start', () => {
    expect(checkRecurring(recurring({ everyMonths: '13' }), { editing: false })).toMatchObject({ ok: false, errors: { everyMonths: 'Every 1 to 12 months.' } });
    expect(checkRecurring(recurring({ startDate: '' }), { editing: false })).toMatchObject({ ok: false, errors: { startDate: expect.any(String) } });
    expect(checkRecurring(recurring({ endDate: '2026-11-01' }), { editing: false }))
      .toMatchObject({ ok: false, errors: { endDate: 'The end date can’t be before the start.' } });
  });
});

describe('schedules', () => {
  it('caps the repeat day at 28', () => {
    expect(repeatDay('2026-11-05')).toBe(5);
    expect(repeatDay('2026-01-31')).toBe(28);
    expect(repeatDay('nope')).toBeNull();
  });

  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [23, '23rd']])(
    'ordinal(%i) = %s', (n, text) => expect(ordinal(n)).toBe(text),
  );

  it('describes the schedule', () => {
    expect(describeSchedule(1, 5)).toBe('Monthly on the 5th');
    expect(describeSchedule(3, 1)).toBe('Every 3 months on the 1st');
    expect(describeSchedule(12, 28)).toBe('Yearly on the 28th');
  });
});

describe('list helpers', () => {
  it('maps the voided filter to the API', () => {
    expect(voidedQuery(readVoidedFilter(''))).toBeUndefined();
    expect(voidedQuery(readVoidedFilter('only'))).toBe('true');
    expect(voidedQuery(readVoidedFilter('junk'))).toBeUndefined();
  });

  it('reads the generated count', () => {
    expect(readCreated({ data: { created: 3 } })).toBe(3);
    expect(readCreated({ created: 1 })).toBe(1);
    expect(readCreated(undefined)).toBe(0);
  });
});

describe('error messages', () => {
  it('words the phase 6 codes', () => {
    expect(expensesErrorMessage(apiError('EXPENSE_VOID'))).toBe('This expense has been voided, so it can’t be changed.');
    expect(expensesErrorMessage(apiError('UNSUPPORTED_FILE', 415))).toMatch(/JPEG, PNG or WebP\) or a PDF/);
    expect(expensesErrorMessage(apiError('FILE_TOO_LARGE', 413))).toMatch(/10 MB/);
    expect(expensesErrorMessage(apiError('PAYLOAD_TOO_LARGE', 413))).toMatch(/10 MB/);
    expect(expensesErrorMessage(apiError('UPLOAD_INVALID', 422))).toMatch(/Attach the file again/);
  });

  it('falls back to the server’s words for unknown codes', () => {
    expect(uploadErrorMessage(apiError('SOMETHING_NEW'), (e) => (e as Error).message)).toBe('server says SOMETHING_NEW');
  });
});
