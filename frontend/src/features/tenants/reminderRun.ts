/**
 * "Send due reminders" on the tenants page: the result of `POST /tenants/run-reminders`
 * (with or without `dryRun`) and how it reads before and after sending.
 */

export interface ReminderRun {
  /** Texts the SMS provider accepted (always 0 for a dry run). */
  sent: number;
  /** Tenants texted — or, for a dry run, who would be — per kind. */
  due: number;
  overdue: number;
  /** Present when nothing ran, e.g. "reminders are off". */
  skipped?: string;
  dryRun?: boolean;
}

const tenants = (n: number) => `${n} ${n === 1 ? 'tenant' : 'tenants'}`;
const reminders = (n: number) => `${n} rent ${n === 1 ? 'reminder' : 'reminders'}`;
const split = (r: ReminderRun) => `(${r.due} due soon, ${r.overdue} overdue)`;

const OFF = 'Automatic rent reminders are off for your organisation. Turn them on in Settings → Organisation first.';

export function reminderPreview(r: ReminderRun): { canSend: boolean; text: string } {
  if (r.skipped) return { canSend: false, text: OFF };
  const total = r.due + r.overdue;
  if (total === 0) {
    return {
      canSend: false,
      text: 'No tenant needs a reminder today — nobody is due in the reminder window or overdue on a reminder day, or they were already texted today.',
    };
  }
  return { canSend: true, text: `This will text ${tenants(total)} ${split(r)}.` };
}

export function reminderResult(r: ReminderRun): { ok: boolean; text: string } {
  if (r.skipped) return { ok: false, text: OFF };
  const total = r.due + r.overdue;
  if (total === 0) return { ok: true, text: 'No due or overdue reminders were needed right now.' };
  if (r.sent < total) {
    const failed = total - r.sent;
    return { ok: false, text: `Sent ${r.sent} of ${reminders(total)}. ${failed} failed — see the message log on each tenant’s page.` };
  }
  return { ok: true, text: `Sent ${reminders(r.sent)} ${split(r)}.` };
}
