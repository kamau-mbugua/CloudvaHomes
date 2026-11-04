import { parseDateOnly, formatDateOnly } from '../../../common/dates/date-only.js';
import { addDays } from '../billing-math.js';

/**
 * Late fees (phase 13): one fee per overdue monthly invoice, charged once its grace days
 * have passed — a flat amount or a percentage of what is still unpaid. Pure rules; the
 * service decides which organisations and properties get them.
 */

export interface LateFeeSettings {
  enabled: boolean;
  mode: 'FLAT' | 'PERCENT';
  /** FLAT: minor units. */
  amount: bigint;
  /** PERCENT: basis points, 500 = 5%. */
  percentBps: number;
  graceDays: number;
}

export const DEFAULT_LATE_FEES: LateFeeSettings = {
  enabled: false,
  mode: 'PERCENT',
  amount: 0n,
  percentBps: 500,
  graceDays: 5,
};

/** Organization.settings.lateFees — JSON, so the flat amount is stored as a string. */
export function readLateFees(settings: unknown): LateFeeSettings {
  const r = (settings as { lateFees?: Record<string, unknown> } | null)?.lateFees ?? {};
  const amount = r.amount;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_LATE_FEES.enabled,
    mode: r.mode === 'FLAT' || r.mode === 'PERCENT' ? r.mode : DEFAULT_LATE_FEES.mode,
    amount:
      typeof amount === 'string' && /^\d+$/.test(amount)
        ? BigInt(amount)
        : typeof amount === 'number' && Number.isSafeInteger(amount)
          ? BigInt(amount)
          : DEFAULT_LATE_FEES.amount,
    percentBps: typeof r.percentBps === 'number' ? r.percentBps : DEFAULT_LATE_FEES.percentBps,
    graceDays: typeof r.graceDays === 'number' ? r.graceDays : DEFAULT_LATE_FEES.graceDays,
  };
}

/** For storing in Organization.settings (JSON has no bigint). */
export function storeLateFees(s: LateFeeSettings) {
  return { ...s, amount: s.amount.toString() };
}

/**
 * The fee for one invoice today, or null for none: only MONTHLY invoices, not void or paid,
 * with money still owed, once `graceDays` have passed since the due date.
 */
export function lateFeeFor(
  inv: { kind: string; status: string; dueDate: string; balance: bigint },
  s: LateFeeSettings,
  today: string,
): bigint | null {
  if (!s.enabled || inv.kind !== 'MONTHLY') return null;
  if (inv.status === 'VOID' || inv.status === 'PAID' || inv.balance <= 0n) return null;
  const chargeFrom = formatDateOnly(addDays(parseDateOnly(inv.dueDate), s.graceDays));
  if (today < chargeFrom) return null;
  const fee =
    s.mode === 'FLAT' ? s.amount : (inv.balance * BigInt(s.percentBps) + 5_000n) / 10_000n;
  return fee > 0n ? fee : null;
}
