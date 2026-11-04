import { formatDay, isDay } from '../../lib/dates';
import { isPeriod } from '../../lib/periods';
import { CATEGORY_KEYS } from '../expenses/labels';
import type { ActionKind, PnlFigures } from './types';

/**
 * Pure report rules: rates as percentages, compact money for chart axes, a "nice" axis
 * scale, month ranges and which expense categories a P&L shows. No React.
 */

/** 0.82 → "82%", 0.8251 → "82.5%", null → "—". A rate is a 0–1 number from the API. */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  const pct = Math.round(rate * 1000) / 10;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/**
 * Cents → a short label for a chart axis: 0 → "0", 50000 → "KES 500",
 * 25000000 → "KES 250K", 120000000 → "KES 1.2M". Exact figures are in the table.
 */
export function formatCompactKES(minor: number): string {
  if (minor === 0) return '0';
  const sign = minor < 0 ? '-' : '';
  const shillings = Math.abs(minor) / 100;
  const short = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };
  if (shillings >= 1_000_000) return `${sign}KES ${short(shillings / 1_000_000)}M`;
  if (shillings >= 1_000) return `${sign}KES ${short(shillings / 1_000)}K`;
  return `${sign}KES ${short(shillings)}`;
}

/**
 * An axis from 0 to a round number at or above `maxMinor`, with `count` equal steps of
 * 1, 2, 2.5 or 5 × a power of ten shillings. An empty series gets KES 0–1,000.
 */
export function niceScale(maxMinor: number, count = 4): { max: number; ticks: number[] } {
  const top = Math.max(0, maxMinor) / 100;
  if (top === 0) {
    const step = 250;
    return { max: step * count * 100, ticks: Array.from({ length: count + 1 }, (_, i) => i * step * 100) };
  }
  const raw = top / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw - 1e-9) ?? 10 * power;
  const stepMinor = Math.round(step * 100);
  const steps = Math.max(1, Math.ceil((top * 100) / stepMinor - 1e-9));
  return { max: stepMinor * steps, ticks: Array.from({ length: steps + 1 }, (_, i) => i * stepMinor) };
}

/** "2026-02" → { from: "2026-02-01", to: "2026-02-28" } — the month as a day range. */
export function periodRange(period: string): { from: string; to: string } {
  if (!isPeriod(period)) return { from: '', to: '' };
  const [year, month] = period.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`), or null. */
export function daysBetween(from: string, to: string): number | null {
  if (!isDay(from) || !isDay(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A P&L month range check: both months, in order, not past `max` (this month). */
export function checkMonthRange(from: string, to: string, max: string): string | null {
  if (!isPeriod(from) || !isPeriod(to)) return 'Choose the first and last month.';
  if (from > to) return 'The first month must not be after the last.';
  if (to > max) return 'The last month can’t be in the future.';
  return null;
}

/**
 * The expense categories a P&L shows as columns: those with anything spent in the totals
 * (or any row), in the fixed category order, then any the API adds that we don't know.
 */
export function pnlCategories(report: { rows: readonly Pick<PnlFigures, 'expenses'>[]; totals: Pick<PnlFigures, 'expenses'> }): string[] {
  const used = new Set<string>();
  for (const figures of [report.totals, ...report.rows]) {
    for (const [key, value] of Object.entries(figures.expenses ?? {})) {
      if (key !== 'total' && typeof value === 'number' && value !== 0) used.add(key);
    }
  }
  const known = CATEGORY_KEYS.filter((k) => used.has(k));
  const unknown = [...used].filter((k) => !(CATEGORY_KEYS as string[]).includes(k)).sort();
  return [...known, ...unknown];
}

/** The tab on the reports page, from the address. */
export type ReportTab = 'pnl' | 'arrears' | 'occupancy' | 'mri';

export function readReportTab(value: string): ReportTab {
  return value === 'arrears' || value === 'occupancy' || value === 'mri' ? value : 'pnl';
}

/**
 * A column bar as an SVG path: square at the baseline, corners of radius `r` at the data
 * end (clamped so a short bar stays a bar). Zero height draws nothing.
 */
export function columnPath(x: number, y: number, width: number, height: number, r = 4): string {
  if (height <= 0 || width <= 0) return '';
  const radius = Math.min(r, width / 2, height);
  const bottom = y + height;
  return [
    `M${x},${bottom}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${bottom}`,
    'Z',
  ].join(' ');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where each "Needs attention" item leads, who may follow it, and how it reads. */
const ACTION_LINKS: Record<ActionKind, { to: string; permission: string; label: (n: number) => string }> = {
  INVOICE_RUN_PENDING: {
    to: '/app/invoices/run',
    permission: 'invoices:view',
    label: (n) => `Invoice run: ${plural(n, 'tenancy', 'tenancies')} not billed yet`,
  },
  UNMATCHED_PAYMENTS: {
    to: '/app/reconciliation',
    permission: 'reconciliation:view',
    label: (n) => `${plural(n, 'M-Pesa payment', 'M-Pesa payments')} to match`,
  },
  OVERDUE_TENANTS: {
    to: '/app/reports?tab=arrears',
    permission: 'reports:view',
    label: (n) => `${plural(n, 'tenant', 'tenants')} overdue`,
  },
  NOTICE_ENDING: {
    to: '/app/tenancies?status=NOTICE',
    permission: 'tenancies:view',
    label: (n) => (n === 1 ? '1 tenancy ends within 14 days' : `${n} tenancies end within 14 days`),
  },
  REMITTANCES_TO_APPROVE: {
    to: '/app/remittances?status=DRAFT',
    permission: 'remittances:view',
    label: (n) => `${plural(n, 'remittance', 'remittances')} to approve`,
  },
  LEASES_EXPIRING: {
    to: '/app/tenancies?expiring=60',
    permission: 'tenancies:view',
    label: (n) => (n === 1 ? '1 lease ends within 60 days' : `${n} leases end within 60 days`),
  },
};

export function actionLink(kind: ActionKind) {
  return ACTION_LINKS[kind];
}

/** 750 → "7.5%" (basis points). */
export function mriRate(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** The notice above the MRI table: what is counted, and that it is an estimate. */
export function mriNotice(rateBps: number, dueDate: string): string {
  return `Estimate: residential rent received this month at ${mriRate(rateBps)}, due by ${formatDay(dueDate)}. Commercial properties, water and other charges, deposits and late fees are left out. Confirm with your tax advisor before filing on KRA iTax.`;
}

/** "7.5" → 750 basis points; 0–50% with at most two decimals. */
export function parseRatePercent(text: string): { ok: true; bps: number } | { ok: false; error: string } {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text.trim());
  const bps = m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : NaN;
  return m && bps <= 5000 ? { ok: true, bps } : { ok: false, error: 'Enter a rate from 0 to 50, with at most two decimals.' };
}
