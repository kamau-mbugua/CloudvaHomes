import type { ReminderSettings } from '../../lib/auth/types';

/**
 * Organisation reminder settings (phase 7): off by default, 3 days before the due date,
 * and 3 and 10 days after it. Pure, so it is tested on its own.
 */

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, daysBefore: 3, overdueDays: [3, 10] };

/** What the server sent, or the defaults for anything missing (an older server). */
export function readReminders(value: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_REMINDERS.enabled,
    daysBefore: typeof value?.daysBefore === 'number' ? value.daysBefore : DEFAULT_REMINDERS.daysBefore,
    overdueDays: Array.isArray(value?.overdueDays) ? value.overdueDays : DEFAULT_REMINDERS.overdueDays,
  };
}

/** [3, 10] → "3, 10". */
export function overdueDaysText(days: readonly number[]): string {
  return days.join(', ');
}

export interface ReminderDraft {
  enabled: boolean;
  daysBefore: string;
  overdueDays: string;
}

export type CheckedReminders =
  | { ok: true; reminders: ReminderSettings }
  | { ok: false; errors: Partial<Record<'daysBefore' | 'overdueDays', string>> };

/**
 * Days before: a whole number 0–14 (0 = no "due soon" reminder). Overdue days: up to five
 * whole numbers 1–90, separated by commas or spaces; blank = no overdue reminders. They
 * are sent sorted, without repeats.
 */
export function checkReminders(draft: ReminderDraft): CheckedReminders {
  const errors: Partial<Record<'daysBefore' | 'overdueDays', string>> = {};

  const before = draft.daysBefore.trim();
  let daysBefore = 0;
  if (!/^\d+$/.test(before)) errors.daysBefore = 'A whole number of days, 0 to 14.';
  else if (Number(before) > 14) errors.daysBefore = 'At most 14 days.';
  else daysBefore = Number(before);

  const parts = draft.overdueDays.split(/[\s,;]+/).filter(Boolean);
  let overdueDays: number[] = [];
  if (parts.some((p) => !/^\d+$/.test(p))) errors.overdueDays = 'Whole numbers of days, separated by commas, e.g. 3, 10.';
  else {
    const numbers = parts.map(Number);
    if (numbers.some((n) => n < 1 || n > 90)) errors.overdueDays = 'Each one 1 to 90 days after the due date.';
    else {
      overdueDays = [...new Set(numbers)].sort((a, b) => a - b);
      if (overdueDays.length > 5) errors.overdueDays = 'At most five overdue reminders.';
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, reminders: { enabled: draft.enabled, daysBefore, overdueDays } };
}

/** One sentence on what the settings will do, for the form. */
export function describeReminders(r: ReminderSettings): string {
  if (!r.enabled) return 'Reminders are off. Tenants get no automatic messages.';
  const parts: string[] = [];
  if (r.daysBefore > 0) parts.push(`${r.daysBefore} ${r.daysBefore === 1 ? 'day' : 'days'} before rent is due`);
  if (r.overdueDays.length > 0) {
    const list = r.overdueDays.length === 1
      ? String(r.overdueDays[0])
      : `${r.overdueDays.slice(0, -1).join(', ')} and ${r.overdueDays[r.overdueDays.length - 1]}`;
    parts.push(`${list} ${r.overdueDays.length === 1 && r.overdueDays[0] === 1 ? 'day' : 'days'} after it was due`);
  }
  if (parts.length === 0) return 'Reminders are on, but no days are set, so nothing is sent.';
  return `Tenants who owe get an SMS ${parts.join(', and ')} — at most one a day, at 9:00.`;
}
