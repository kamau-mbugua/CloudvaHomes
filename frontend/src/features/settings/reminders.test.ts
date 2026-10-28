import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDERS, checkReminders, describeReminders, overdueDaysText, readReminders } from './reminders';

describe('readReminders', () => {
  it('fills in the defaults (off, 3 before, 3 and 10 after)', () => {
    expect(readReminders(undefined)).toEqual(DEFAULT_REMINDERS);
    expect(DEFAULT_REMINDERS).toEqual({ enabled: false, daysBefore: 3, overdueDays: [3, 10] });
    expect(readReminders({ enabled: true })).toEqual({ enabled: true, daysBefore: 3, overdueDays: [3, 10] });
    expect(overdueDaysText([3, 10])).toBe('3, 10');
  });
});

describe('checkReminders', () => {
  it('accepts commas or spaces, and sorts and de-duplicates', () => {
    expect(checkReminders({ enabled: true, daysBefore: '0', overdueDays: '10 3, 3' }))
      .toEqual({ ok: true, reminders: { enabled: true, daysBefore: 0, overdueDays: [3, 10] } });
  });
  it('allows no overdue reminders', () => {
    expect(checkReminders({ enabled: false, daysBefore: '3', overdueDays: '' }))
      .toEqual({ ok: true, reminders: { enabled: false, daysBefore: 3, overdueDays: [] } });
  });
  it('holds to the contract limits', () => {
    const bad = (draft: { daysBefore?: string; overdueDays?: string }) => {
      const out = checkReminders({ enabled: true, daysBefore: '3', overdueDays: '3', ...draft });
      return out.ok ? null : out.errors;
    };
    expect(bad({ daysBefore: '15' })?.daysBefore).toMatch(/14/);
    expect(bad({ daysBefore: '-1' })?.daysBefore).toMatch(/0 to 14/);
    expect(bad({ daysBefore: '' })?.daysBefore).toBeTruthy();
    expect(bad({ overdueDays: '0' })?.overdueDays).toMatch(/1 to 90/);
    expect(bad({ overdueDays: '91' })?.overdueDays).toMatch(/1 to 90/);
    expect(bad({ overdueDays: '1, 2, 3, 4, 5, 6' })?.overdueDays).toMatch(/five/);
    expect(bad({ overdueDays: '1, 2, 3, 4, 5' })).toBeNull();
    expect(bad({ overdueDays: '3.5' })?.overdueDays).toMatch(/Whole numbers/);
  });
});

describe('describeReminders', () => {
  it('says what will be sent', () => {
    expect(describeReminders({ enabled: false, daysBefore: 3, overdueDays: [3, 10] })).toMatch(/off/);
    expect(describeReminders({ enabled: true, daysBefore: 3, overdueDays: [3, 10] }))
      .toBe('Tenants who owe get an SMS 3 days before rent is due, and 3 and 10 days after it was due — at most one a day, at 9:00.');
    expect(describeReminders({ enabled: true, daysBefore: 0, overdueDays: [] })).toMatch(/nothing is sent/);
  });
});
