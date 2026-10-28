import { money } from '../../common/pdf/pdf.js';
import { addDays } from '../billing/billing-math.js';
import { parseDateOnly, formatDateOnly } from '../../common/dates/date-only.js';

/** Pure reminder rules: who gets which message today, and its wording. */

export interface ReminderSettings {
  enabled: boolean;
  daysBefore: number; // 0 = no "due soon" message
  overdueDays: number[]; // days after the due date
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  daysBefore: 3,
  overdueDays: [3, 10],
};

export function readReminders(settings: unknown): ReminderSettings {
  const r = (settings as { reminders?: Partial<ReminderSettings> } | null)?.reminders ?? {};
  return {
    enabled: r.enabled ?? DEFAULT_REMINDERS.enabled,
    daysBefore: r.daysBefore ?? DEFAULT_REMINDERS.daysBefore,
    overdueDays: r.overdueDays ?? DEFAULT_REMINDERS.overdueDays,
  };
}

export interface OpenInvoice {
  tenantId: string;
  dueDate: string; // YYYY-MM-DD
  balance: bigint;
}

export type Plan =
  | { kind: 'REMINDER_OVERDUE'; amount: bigint; since: string }
  | { kind: 'REMINDER_DUE'; amount: bigint; due: string };

/**
 * Today's message for each tenant (at most one): overdue beats due-soon. Overdue fires when
 * any overdue invoice is exactly one of `overdueDays` past due and covers everything overdue;
 * due-soon covers the invoices due exactly `daysBefore` from today.
 */
export function planReminders(
  invoices: OpenInvoice[],
  s: ReminderSettings,
  today: string,
): Map<string, Plan> {
  const out = new Map<string, Plan>();
  const days = (d: string) =>
    Math.round((parseDateOnly(today).getTime() - parseDateOnly(d).getTime()) / 86_400_000);
  const dueOn =
    s.daysBefore > 0 ? formatDateOnly(addDays(parseDateOnly(today), s.daysBefore)) : null;
  const byTenant = new Map<string, OpenInvoice[]>();
  for (const i of invoices) {
    if (i.balance <= 0n) continue;
    byTenant.set(i.tenantId, [...(byTenant.get(i.tenantId) ?? []), i]);
  }
  for (const [tenantId, list] of byTenant) {
    const overdue = list.filter((i) => days(i.dueDate) > 0);
    if (overdue.some((i) => s.overdueDays.includes(days(i.dueDate)))) {
      const since = overdue.map((i) => i.dueDate).sort()[0]!;
      out.set(tenantId, {
        kind: 'REMINDER_OVERDUE',
        amount: overdue.reduce((a, i) => a + i.balance, 0n),
        since,
      });
      continue;
    }
    const soon = dueOn ? list.filter((i) => i.dueDate === dueOn) : [];
    if (soon.length)
      out.set(tenantId, {
        kind: 'REMINDER_DUE',
        amount: soon.reduce((a, i) => a + i.balance, 0n),
        due: dueOn!,
      });
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-05" → "5 Nov 2026" */
export function shortDate(d: string): string {
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

export interface PayHint {
  shortcode: string;
  kind: 'MPESA_PAYBILL' | 'MPESA_TILL';
}

/** One SMS (≤ 160 characters): the organisation name is shortened first if needed. */
export function reminderText(
  p: { firstName: string; code: string; orgName: string; pay: PayHint | null },
  plan: Plan | { kind: 'REMINDER_MANUAL'; amount: bigint },
): string {
  const what =
    plan.kind === 'REMINDER_DUE'
      ? `KES ${money(plan.amount)} is due on ${shortDate(plan.due)}.`
      : plan.kind === 'REMINDER_OVERDUE'
        ? `KES ${money(plan.amount)} is overdue (since ${shortDate(plan.since)}).`
        : `your balance is KES ${money(plan.amount)}.`;
  const pay = p.pay
    ? p.pay.kind === 'MPESA_PAYBILL'
      ? ` Pay to paybill ${p.pay.shortcode}, account ${p.code}.`
      : ` Pay to till ${p.pay.shortcode}.`
    : '';
  const head = `Hi ${p.firstName}, ${what}${pay} `;
  return head + p.orgName.slice(0, Math.max(0, 160 - head.length));
}
