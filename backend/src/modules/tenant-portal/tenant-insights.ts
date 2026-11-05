/**
 * Pure helpers behind the tenant dashboard (tenant portal redesign): the billed-vs-paid
 * series and the merged activity feed.
 */

/** The `n` months ending with `today`'s month, oldest first (`YYYY-MM`). */
export function lastMonths(today: string, n: number): string[] {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export interface MonthlyPoint {
  period: string;
  invoiced: bigint;
  paid: bigint;
}

/**
 * Invoiced by invoice period, paid by the month the money arrived (allocations; reversals
 * are negative). Anything outside `months` is ignored.
 */
export function monthlySeries(
  months: readonly string[],
  invoices: readonly { period: string; amount: bigint }[],
  allocations: readonly { month: string; amount: bigint }[],
): MonthlyPoint[] {
  const rows = new Map(months.map((p) => [p, { period: p, invoiced: 0n, paid: 0n }]));
  for (const i of invoices) {
    const r = rows.get(i.period);
    if (r) r.invoiced += i.amount;
  }
  for (const a of allocations) {
    const r = rows.get(a.month);
    if (r) r.paid += a.amount;
  }
  return months.map((p) => rows.get(p)!);
}

/** Newest first across every source, cut to `limit`. `at` is an ISO timestamp. */
export function mergeActivity<T extends { at: string }>(
  sources: readonly T[][],
  limit: number,
): T[] {
  return sources
    .flat()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}
