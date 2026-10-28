import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { buildUnitNumbers } from './unitNumbers';
import {
  LANDLORD_KIND, OCCUPANCY, RECORD_STATUS, TENANCY_STATUS, TENANT_STATUS,
  defaultBillingDay, labelFor, optionsOf, personName, unitLabel,
} from './labels';
import { splitFormError } from './formErrors';
import { portfolioErrorMessage } from './api';
import { propertyAccessValue } from './access';
import { nullable, optional, wholeNumber } from './forms';

describe('buildUnitNumbers', () => {
  const numbers = (prefix: string, from: string, to: string) => {
    const result = buildUnitNumbers({ prefix, from, to });
    return result.ok ? result.numbers : result.error;
  };

  it('joins the prefix to each number in the range', () => {
    expect(numbers('A', '1', '4')).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(numbers('', '101', '103')).toEqual(['101', '102', '103']);
    expect(numbers(' B- ', '9', '11')).toEqual(['B-9', 'B-10', 'B-11']);
  });

  it('gives a single number when from and to match', () => {
    expect(numbers('G', '7', '7')).toEqual(['G7']);
  });

  it('keeps the width set by leading zeros in "from"', () => {
    expect(numbers('A', '01', '12')).toEqual([
      'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12',
    ]);
    expect(numbers('', '001', '3')).toEqual(['001', '002', '003']);
    expect(numbers('', '0', '2')).toEqual(['0', '1', '2']);
  });

  it('rejects missing, non-numeric, reversed and spaced input', () => {
    expect(numbers('A', '', '4')).toBe('Enter the first and last number.');
    expect(numbers('A', '1', 'x')).toBe('From and to must be whole numbers.');
    expect(numbers('A', '-1', '3')).toBe('From and to must be whole numbers.');
    expect(numbers('A', '1.5', '3')).toBe('From and to must be whole numbers.');
    expect(numbers('A', '5', '4')).toBe('“To” must be the same as or after “From”.');
    expect(numbers('Block A', '1', '2')).toBe('The prefix cannot contain spaces.');
  });

  it('caps a batch at 500', () => {
    const ok = buildUnitNumbers({ prefix: '', from: '1', to: '500' });
    expect(ok.ok && ok.numbers.length).toBe(500);
    expect(numbers('', '1', '501')).toBe('That is 501 units; add at most 500 at a time.');
  });
});

describe('labels', () => {
  it('names occupancy the way staff say it', () => {
    expect(OCCUPANCY.OCCUPIED.label).toBe('Occupied');
    expect(OCCUPANCY.NOTICE.label).toBe('On notice');
    expect(OCCUPANCY.VACANT.label).toBe('Vacant');
  });

  it('labels every tenancy, tenant and record status with a badge tone', () => {
    for (const table of [OCCUPANCY, TENANCY_STATUS, TENANT_STATUS, RECORD_STATUS]) {
      for (const entry of Object.values(table)) {
        expect(entry.label).not.toBe('');
        expect(entry.tone).toMatch(/^ad__badge--(ok|warn|info|off|alert)$/);
      }
    }
    expect(TENANCY_STATUS.ENDED.label).toBe('Ended');
    expect(TENANT_STATUS.PROSPECT.label).toBe('Prospect');
    expect(LANDLORD_KIND.COMPANY).toBe('Company');
  });

  it('falls back to the raw value for an unknown state', () => {
    expect(labelFor(OCCUPANCY, 'VACANT').label).toBe('Vacant');
    expect(labelFor(OCCUPANCY, 'RENOVATING')).toEqual({ label: 'RENOVATING', tone: 'ad__badge--off' });
  });

  it('builds filter options in declaration order', () => {
    expect(optionsOf(TENANT_STATUS)).toEqual([
      { value: 'CURRENT', label: 'Current' },
      { value: 'PAST', label: 'Past' },
      { value: 'PROSPECT', label: 'Prospect' },
    ]);
  });

  it('formats names and unit labels', () => {
    expect(personName({ firstName: 'Test', lastName: 'Tenant' })).toBe('Test Tenant');
    expect(unitLabel({ number: 'A4', property: { name: 'Sample Court' } })).toBe('A4 · Sample Court');
  });
});

describe('defaultBillingDay', () => {
  it('uses the start day, capped at 28', () => {
    expect(defaultBillingDay('2026-11-01')).toBe(1);
    expect(defaultBillingDay('2026-11-15')).toBe(15);
    expect(defaultBillingDay('2026-11-28')).toBe(28);
    expect(defaultBillingDay('2026-10-29')).toBe(28);
    expect(defaultBillingDay('2026-10-31')).toBe(28);
  });

  it('gives nothing for a missing date', () => {
    expect(defaultBillingDay('')).toBeNull();
    expect(defaultBillingDay('2026-10')).toBeNull();
  });
});

describe('splitFormError', () => {
  const describeError = () => 'general';
  const validation = (details: { field: string; message: string }[]) =>
    new ApiError({ status: 422, code: 'VALIDATION_FAILED', message: 'Check the form.', details });

  it('puts 422 details beside the fields the form shows', () => {
    const result = splitFormError(validation([
      { field: 'phone', message: 'Not a valid phone number.' },
      { field: 'phone', message: 'second message is ignored' },
    ]), { fields: ['phone', 'email'], describe: describeError });
    expect(result).toEqual({ fieldErrors: { phone: 'Not a valid phone number.' }, general: null });
  });

  it('strips a prefix and keeps unknown fields in the general message', () => {
    const result = splitFormError(validation([
      { field: 'tenant.phone', message: 'Required.' },
      { field: 'billingDay', message: 'Must be 1–28.' },
    ]), { fields: ['phone'], prefix: 'tenant.', describe: describeError });
    expect(result.fieldErrors).toEqual({ phone: 'Required.' });
    expect(result.general).toBe('Check the form. billingDay: Must be 1–28.');
  });

  it('puts a listed conflict beside its field, worded by describe', () => {
    const error = new ApiError({ status: 409, code: 'PHONE_TAKEN', message: 'Taken by T00012' });
    const result = splitFormError(error, { fields: ['phone'], conflicts: { PHONE_TAKEN: 'phone' }, describe: portfolioErrorMessage });
    expect(result).toEqual({ fieldErrors: { phone: 'Another tenant (T00012) already uses this phone number.' }, general: null });
  });

  it('keeps a conflict general when the form has no such field', () => {
    const error = new ApiError({ status: 409, code: 'PHONE_TAKEN', message: 'x' });
    expect(splitFormError(error, { fields: ['name'], conflicts: { PHONE_TAKEN: 'phone' }, describe: describeError }).general).toBe('general');
  });

  it('describes anything else, and nothing when there is no error', () => {
    const error = new ApiError({ status: 409, code: 'UNIT_OCCUPIED', message: 'x' });
    expect(splitFormError(error, { fields: [], describe: describeError })).toEqual({ fieldErrors: {}, general: 'general' });
    expect(splitFormError(null, { fields: [], describe: describeError })).toEqual({ fieldErrors: {}, general: null });
  });
});

describe('portfolioErrorMessage', () => {
  const message = (code: string, text = 'server text') =>
    portfolioErrorMessage(new ApiError({ status: 409, code, message: text }));

  it('has plain-English messages for every phase 2 code', () => {
    const codes = [
      'AGENCY_ONLY', 'CODE_TAKEN', 'NUMBER_TAKEN', 'PHONE_TAKEN', 'ID_NUMBER_TAKEN', 'IN_USE',
      'LANDLORD_HAS_PROPERTIES', 'PROPERTY_HAS_UNITS', 'UNIT_HAS_HISTORY', 'TENANT_HAS_HISTORY',
      'UNIT_OCCUPIED', 'UNIT_INACTIVE', 'TENANCY_ENDED', 'NAME_TAKEN',
    ];
    for (const code of codes) expect(message(code), code).not.toBe('server text');
  });

  it('names the tenant who already has the phone number', () => {
    expect(message('PHONE_TAKEN', 'Phone already used by tenant T00012')).toBe('Another tenant (T00012) already uses this phone number.');
    expect(message('PHONE_TAKEN', 'Phone already used')).toBe('Another tenant already uses this phone number.');
  });

  it('falls back to the server message', () => {
    expect(message('SOMETHING_NEW', 'Server says no.')).toBe('Server says no.');
    expect(portfolioErrorMessage(new Error('x'))).toBe('Something went wrong. Try again.');
  });
});

describe('propertyAccessValue', () => {
  it('sends an empty list for all properties, whatever is ticked', () => {
    expect(propertyAccessValue(false, ['p1'])).toEqual({ ok: true, ids: [] });
  });

  it('sends the ticked ids when limited', () => {
    expect(propertyAccessValue(true, ['p1', 'p2'])).toEqual({ ok: true, ids: ['p1', 'p2'] });
  });

  it('refuses "only some" with nothing ticked, which would otherwise mean all', () => {
    expect(propertyAccessValue(true, []).ok).toBe(false);
  });
});

describe('form value helpers', () => {
  it('optional trims and drops empty text', () => {
    expect(optional('  a@example.invalid ')).toBe('a@example.invalid');
    expect(optional('   ')).toBeUndefined();
  });

  it('nullable trims and turns empty text into null (clears on PATCH)', () => {
    expect(nullable(' Nairobi ')).toBe('Nairobi');
    expect(nullable('')).toBeNull();
  });

  it('wholeNumber reads digits, null when empty, NaN otherwise', () => {
    expect(wholeNumber(' 3 ')).toBe(3);
    expect(wholeNumber('0')).toBe(0);
    expect(wholeNumber('')).toBeNull();
    expect(wholeNumber('2.5')).toBeNaN();
    expect(wholeNumber('-1')).toBeNaN();
    expect(wholeNumber('two')).toBeNaN();
  });
});
