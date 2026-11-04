import { formatKES, parseAmount } from '../../lib/money';

/**
 * Organisation late-fee settings (phase 13). One fee per overdue monthly invoice, after a
 * number of grace days: a flat amount or a percentage of what is still unpaid. In an
 * agency, only on properties whose agreement says who keeps the fee (owner decision).
 */

export interface LateFeeSettings {
  enabled: boolean;
  mode: 'FLAT' | 'PERCENT';
  /** FLAT: cents. */
  amount: number;
  /** PERCENT: basis points, 500 = 5%. */
  percentBps: number;
  graceDays: number;
}

export interface LateFeeView extends LateFeeSettings {
  /** Agencies: current agreements that don't say who keeps late fees. */
  agreementsMissingRecipient: number;
}

const DEFAULTS: LateFeeView = { enabled: false, mode: 'PERCENT', amount: 0, percentBps: 500, graceDays: 5, agreementsMissingRecipient: 0 };

export function readLateFees(value: Partial<LateFeeView> | null | undefined): LateFeeView {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    mode: value?.mode === 'FLAT' || value?.mode === 'PERCENT' ? value.mode : DEFAULTS.mode,
    amount: typeof value?.amount === 'number' ? value.amount : DEFAULTS.amount,
    percentBps: typeof value?.percentBps === 'number' ? value.percentBps : DEFAULTS.percentBps,
    graceDays: typeof value?.graceDays === 'number' ? value.graceDays : DEFAULTS.graceDays,
    agreementsMissingRecipient: typeof value?.agreementsMissingRecipient === 'number' ? value.agreementsMissingRecipient : 0,
  };
}

export interface LateFeeDraft {
  enabled: boolean;
  mode: 'FLAT' | 'PERCENT';
  /** KES, as typed. */
  amount: string;
  /** Percent, as typed, e.g. "5" or "2.5". */
  percent: string;
  graceDays: string;
}

type DraftField = 'amount' | 'percent' | 'graceDays';
export type CheckedLateFees = { ok: true; lateFees: LateFeeSettings } | { ok: false; errors: Partial<Record<DraftField, string>> };

/** "5" → 500, "2.5" → 250; null when not a percentage with at most two decimals. */
function percentToBps(text: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Validates the fields in use; while switched off, saves what it can and keeps defaults. */
export function checkLateFees(d: LateFeeDraft): CheckedLateFees {
  const errors: Partial<Record<DraftField, string>> = {};
  const grace = /^\d{1,2}$/.test(d.graceDays.trim()) ? Number(d.graceDays.trim()) : null;
  const bps = percentToBps(d.percent);
  const amount = parseAmount(d.amount);

  if (!d.enabled) {
    return {
      ok: true,
      lateFees: {
        enabled: false,
        mode: d.mode,
        amount: amount.ok ? amount.minor : 0,
        percentBps: bps !== null && bps >= 1 && bps <= 2500 ? bps : DEFAULTS.percentBps,
        graceDays: grace !== null && grace <= 60 ? grace : DEFAULTS.graceDays,
      },
    };
  }
  if (grace === null || grace > 60) errors.graceDays = 'Enter a whole number of days from 0 to 60.';
  if (d.mode === 'PERCENT' && (bps === null || bps < 1 || bps > 2500)) errors.percent = 'Enter a percentage from 0.01 to 25.';
  if (d.mode === 'FLAT' && (!amount.ok || amount.minor <= 0)) errors.amount = amount.ok ? 'Enter a fee above zero.' : amount.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    lateFees: {
      enabled: true,
      mode: d.mode,
      amount: d.mode === 'FLAT' && amount.ok ? amount.minor : 0,
      percentBps: d.mode === 'PERCENT' && bps !== null ? bps : DEFAULTS.percentBps,
      graceDays: grace!,
    },
  };
}

const EXAMPLE_RENT = 2_500_000;

export function lateFeeExample(s: Pick<LateFeeSettings, 'mode' | 'amount' | 'percentBps' | 'graceDays'>): string {
  const fee = s.mode === 'FLAT' ? s.amount : Math.round((EXAMPLE_RENT * s.percentBps) / 10_000);
  const days = `${s.graceDays} ${s.graceDays === 1 ? 'day' : 'days'}`;
  return `Example: a ${formatKES(EXAMPLE_RENT)} rent invoice still unpaid ${days} after its due date gets a ${formatKES(fee)} late fee.`;
}

export function agencyLateFeeNotice(missing: number): string {
  const lead = 'Late fees are only charged on properties whose management agreement says who keeps them.';
  if (missing === 0) return `${lead} All your current agreements say who keeps them.`;
  return missing === 1
    ? `${lead} 1 of your current agreements doesn’t say yet, so its properties get no late fees.`
    : `${lead} ${missing} of your current agreements don’t say yet, so their properties get no late fees.`;
}
