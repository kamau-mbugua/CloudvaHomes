import { parseDateOnly } from '../../common/dates/date-only.js';

export interface HomeStatus {
  /** Everything still owed on this home's open invoices. */
  due: bigint;
  /** The part of `due` already past its due date. */
  overdue: bigint;
  /** Days since the oldest overdue bill fell due; 0 when nothing is overdue. */
  daysLate: number;
  /** The earliest due date not yet passed, or null. */
  nextDueDate: string | null;
}

/**
 * Where one home (tenancy) stands, from its tenant account's open invoices (tenant portal
 * redesign). Dates are `YYYY-MM-DD` in Nairobi time; a bill due today is not yet overdue.
 */
export function homeStatus(
  open: readonly { tenancyId: string; balance: bigint; dueDate: string }[],
  tenancyId: string,
  today: string,
): HomeStatus {
  let due = 0n;
  let overdue = 0n;
  let oldestOverdue: string | null = null;
  let nextDueDate: string | null = null;
  for (const i of open) {
    if (i.tenancyId !== tenancyId || i.balance <= 0n) continue;
    due += i.balance;
    if (i.dueDate < today) {
      overdue += i.balance;
      if (!oldestOverdue || i.dueDate < oldestOverdue) oldestOverdue = i.dueDate;
    } else if (!nextDueDate || i.dueDate < nextDueDate) {
      nextDueDate = i.dueDate;
    }
  }
  const daysLate = oldestOverdue
    ? Math.round(
        (parseDateOnly(today).getTime() - parseDateOnly(oldestOverdue).getTime()) / 86_400_000,
      )
    : 0;
  return { due, overdue, daysLate, nextDueDate };
}
