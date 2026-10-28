import { Inject, Injectable } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { formatDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toCsv } from '../../common/http/csv.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { orgContext } from '../auth/decorators.js';
import { periodOf, todayInNairobi } from '../billing/billing-math.js';
import { allowedPropertyIds, propertyScope } from '../portfolio/property-scope.js';
import { ageBucket, BUCKETS, type Bucket, lastMonths, monthBounds, ratio } from './report-math.js';

const CATEGORIES = [
  'REPAIRS',
  'UTILITIES',
  'SECURITY',
  'CLEANING',
  'SALARIES',
  'TAXES',
  'INSURANCE',
  'MANAGEMENT',
  'OTHER',
] as const;
const ZERO_BUCKETS = (): Record<Bucket, bigint> => ({
  current: 0n,
  d1_30: 0n,
  d31_60: 0n,
  d61_90: 0n,
  d90plus: 0n,
});

/**
 * Read-only figures. Raw SQL is not org-scoped by the extension, so every query here filters
 * by orgId and — for property-limited staff — by property explicitly (`scope`).
 * Money basis: invoiced by issue date; collected = money applied to invoices, by the date it
 * was received (reversals subtract on theirs); expenses by date incurred, voided ones excluded.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private org() {
    return orgContext().orgId;
  }

  /** `AND <col> = ANY(...)` for property-limited callers, and for an optional property filter. */
  private scope(column: Prisma.Sql, propertyId?: string): Prisma.Sql {
    const ids = allowedPropertyIds();
    const parts: Prisma.Sql[] = [];
    if (ids) parts.push(Prisma.sql`AND ${column} = ANY(${[...ids]}::uuid[])`);
    if (propertyId) parts.push(Prisma.sql`AND ${column} = ${propertyId}::uuid`);
    return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
  }

  private async properties(propertyId?: string) {
    const rows = await this.db.property.findMany({
      where: { AND: [propertyScope(), propertyId ? { id: propertyId } : {}] },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (propertyId && !rows.length) throw AppError.notFound('Property');
    return rows;
  }

  // ── Monthly series (dashboard trend) ──

  private async invoicedByMonth(from: Date, to: Date) {
    const rows = await this.db.$queryRaw<{ m: string; v: bigint }[]>`
      SELECT to_char(i."issueDate", 'YYYY-MM') AS m, sum(i."total")::bigint AS v
        FROM "invoices" i
       WHERE i."orgId" = ${this.org()}::uuid AND i."status" <> 'VOID'
         AND i."issueDate" BETWEEN ${from} AND ${to} ${this.scope(Prisma.sql`i."propertyId"`)}
       GROUP BY 1`;
    return new Map(rows.map((r) => [r.m, BigInt(r.v)]));
  }

  private async collectedByMonth(from: Date, to: Date) {
    const rows = await this.db.$queryRaw<{ m: string; v: bigint }[]>`
      SELECT to_char(p."receivedAt", 'YYYY-MM') AS m, sum(a."amount")::bigint AS v
        FROM "payment_allocations" a
        JOIN "payments" p ON p."id" = a."paymentId"
        JOIN "invoices" i ON i."id" = a."invoiceId"
       WHERE a."orgId" = ${this.org()}::uuid
         AND p."receivedAt" BETWEEN ${from} AND ${to} ${this.scope(Prisma.sql`i."propertyId"`)}
       GROUP BY 1`;
    return new Map(rows.map((r) => [r.m, BigInt(r.v)]));
  }

  private async expensesByMonth(from: Date, to: Date) {
    const rows = await this.db.$queryRaw<{ m: string; v: bigint }[]>`
      SELECT to_char(e."incurredOn", 'YYYY-MM') AS m, sum(e."amount")::bigint AS v
        FROM "expenses" e
       WHERE e."orgId" = ${this.org()}::uuid AND e."voidedAt" IS NULL
         AND e."incurredOn" BETWEEN ${from} AND ${to} ${this.scope(Prisma.sql`e."propertyId"`)}
       GROUP BY 1`;
    return new Map(rows.map((r) => [r.m, BigInt(r.v)]));
  }

  // ── Dashboard ──

  async dashboard(period = periodOf(todayInNairobi())) {
    const today = todayInNairobi();
    const months = lastMonths(period, 12);
    const from = monthBounds(months[0]!).start;
    const { start, end } = monthBounds(period);
    const [invoiced, collected, expenses] = await Promise.all([
      this.invoicedByMonth(from, end),
      this.collectedByMonth(from, end),
      this.expensesByMonth(from, end),
    ]);
    const paidOnMonth = await this.db.$queryRaw<{ v: bigint | null }[]>`
      SELECT sum(a."amount")::bigint AS v
        FROM "payment_allocations" a JOIN "invoices" i ON i."id" = a."invoiceId"
       WHERE a."orgId" = ${this.org()}::uuid AND i."status" <> 'VOID'
         AND i."issueDate" BETWEEN ${start} AND ${end} ${this.scope(Prisma.sql`i."propertyId"`)}`;
    const arrears = await this.arrears({});
    const overdue = arrears.rows
      .map((r) => ({
        tenant: r.tenant,
        overdue: r.total - r.current,
        oldestDueDate: r.oldestDueDate,
      }))
      .filter((r) => r.overdue > 0n)
      .sort((a, b) => (b.overdue > a.overdue ? 1 : b.overdue < a.overdue ? -1 : 0))
      .slice(0, 5);
    const occupancy = await this.occupancy({});
    const canReconcile = !!currentContext()?.permissions.has('reconciliation:view');
    const inv = invoiced.get(period) ?? 0n;
    const col = collected.get(period) ?? 0n;
    const exp = expenses.get(period) ?? 0n;
    return {
      period,
      invoiced: inv,
      collected: col,
      collectionRate: ratio(paidOnMonth[0]?.v ?? 0n, inv),
      arrears: arrears.totals.total - arrears.totals.current,
      expenses: exp,
      net: col - exp,
      occupancy: occupancy.totals,
      unmatchedMpesa: canReconcile
        ? await this.db.inboundTransaction.count({ where: { matchStatus: 'UNMATCHED' } })
        : null,
      topOverdue: overdue,
      trend: months.map((m) => ({
        period: m,
        invoiced: invoiced.get(m) ?? 0n,
        collected: collected.get(m) ?? 0n,
        expenses: expenses.get(m) ?? 0n,
      })),
      asOf: today,
    };
  }

  // ── Profit and loss per property ──

  async propertyPnl(q: { from: string; to: string; propertyId?: string }) {
    if (q.from > q.to)
      throw AppError.fieldInvalid('from', 'The first month must be before the last');
    const start = monthBounds(q.from).start;
    const end = monthBounds(q.to).end;
    const props = await this.properties(q.propertyId);
    const [lines, collected, spent] = await Promise.all([
      this.db.$queryRaw<{ p: string; kind: string; v: bigint }[]>`
        SELECT i."propertyId" AS p, l."kind" AS kind, sum(l."amount")::bigint AS v
          FROM "invoice_lines" l JOIN "invoices" i ON i."id" = l."invoiceId"
         WHERE i."orgId" = ${this.org()}::uuid AND i."status" <> 'VOID'
           AND i."issueDate" BETWEEN ${start} AND ${end} ${this.scope(Prisma.sql`i."propertyId"`, q.propertyId)}
         GROUP BY 1, 2`,
      this.db.$queryRaw<{ p: string; v: bigint }[]>`
        SELECT i."propertyId" AS p, sum(a."amount")::bigint AS v
          FROM "payment_allocations" a
          JOIN "payments" pm ON pm."id" = a."paymentId"
          JOIN "invoices" i ON i."id" = a."invoiceId"
         WHERE a."orgId" = ${this.org()}::uuid
           AND pm."receivedAt" BETWEEN ${start} AND ${end} ${this.scope(Prisma.sql`i."propertyId"`, q.propertyId)}
         GROUP BY 1`,
      this.db.$queryRaw<{ p: string; c: string; v: bigint }[]>`
        SELECT e."propertyId" AS p, e."category"::text AS c, sum(e."amount")::bigint AS v
          FROM "expenses" e
         WHERE e."orgId" = ${this.org()}::uuid AND e."voidedAt" IS NULL
           AND e."incurredOn" BETWEEN ${start} AND ${end} ${this.scope(Prisma.sql`e."propertyId"`, q.propertyId)}
         GROUP BY 1, 2`,
    ]);
    const blank = () => ({
      invoiced: { rent: 0n, charges: 0n, moveIn: 0n, other: 0n, total: 0n },
      collected: 0n,
      expenses: Object.fromEntries([...CATEGORIES.map((c) => [c, 0n]), ['total', 0n]]) as Record<
        string,
        bigint
      >,
      net: 0n,
    });
    const byProp = new Map(props.map((p) => [p.id, blank()]));
    const key = {
      RENT: 'rent',
      CHARGE: 'charges',
      MOVE_IN: 'moveIn',
      ADJUSTMENT: 'other',
    } as const;
    for (const l of lines) {
      const r = byProp.get(l.p);
      if (!r) continue;
      const k = key[l.kind as keyof typeof key] ?? 'other';
      r.invoiced[k] += BigInt(l.v);
      r.invoiced.total += BigInt(l.v);
    }
    for (const c of collected) {
      const r = byProp.get(c.p);
      if (r) r.collected += BigInt(c.v);
    }
    for (const e of spent) {
      const r = byProp.get(e.p);
      if (!r) continue;
      r.expenses[e.c] = (r.expenses[e.c] ?? 0n) + BigInt(e.v);
      r.expenses.total = (r.expenses.total ?? 0n) + BigInt(e.v);
    }
    const totals = blank();
    const rows = props.map((p) => {
      const r = byProp.get(p.id)!;
      r.net = r.collected - (r.expenses.total ?? 0n);
      for (const k of Object.keys(totals.invoiced) as (keyof typeof totals.invoiced)[])
        totals.invoiced[k] += r.invoiced[k];
      for (const k of Object.keys(totals.expenses))
        totals.expenses[k] = (totals.expenses[k] ?? 0n) + (r.expenses[k] ?? 0n);
      totals.collected += r.collected;
      totals.net += r.net;
      return { property: p, ...r };
    });
    return { from: q.from, to: q.to, rows, totals };
  }

  // ── Arrears ageing ──

  async arrears(q: { propertyId?: string }) {
    const today = todayInNairobi();
    if (q.propertyId) await this.properties(q.propertyId);
    const ids = allowedPropertyIds();
    const invoices = await this.db.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        ...(q.propertyId
          ? { propertyId: q.propertyId }
          : ids
            ? { propertyId: { in: [...ids] } }
            : {}),
      },
      select: {
        tenantId: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        creditedAmount: true,
        tenancy: {
          select: {
            tenant: {
              select: {
                id: true,
                code: true,
                firstName: true,
                lastName: true,
                phone: true,
                creditBalance: true,
                tenancies: {
                  where: { status: { in: ['ACTIVE', 'NOTICE'] } },
                  select: {
                    unit: { select: { number: true, property: { select: { name: true } } } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    const byTenant = new Map<
      string,
      {
        tenant: (typeof invoices)[number]['tenancy']['tenant'];
        b: Record<Bucket, bigint>;
        oldest: string;
      }
    >();
    for (const i of invoices) {
      const balance = i.total - i.amountPaid - i.creditedAmount;
      if (balance <= 0n) continue;
      const due = formatDateOnly(i.dueDate);
      const row = byTenant.get(i.tenantId) ?? {
        tenant: i.tenancy.tenant,
        b: ZERO_BUCKETS(),
        oldest: due,
      };
      row.b[ageBucket(due, today)] += balance;
      if (due < row.oldest) row.oldest = due;
      byTenant.set(i.tenantId, row);
    }
    const totals = { ...ZERO_BUCKETS(), total: 0n, credit: 0n };
    const rows = [...byTenant.values()]
      .map(({ tenant, b, oldest }) => {
        const total = BUCKETS.reduce((s, k) => s + b[k], 0n);
        for (const k of BUCKETS) totals[k] += b[k];
        totals.total += total;
        totals.credit += tenant.creditBalance;
        return {
          tenant: {
            id: tenant.id,
            code: tenant.code,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone,
          },
          units: tenant.tenancies.map((t) => `${t.unit.number} · ${t.unit.property.name}`),
          ...b,
          total,
          credit: tenant.creditBalance,
          oldestDueDate: oldest,
        };
      })
      .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
    return { asOf: today, rows, totals };
  }

  // ── Occupancy ──

  async occupancy(q: { propertyId?: string }) {
    const props = await this.properties(q.propertyId);
    const ids = props.map((p) => p.id);
    const units = ids.length
      ? await this.db.unit.findMany({
          where: { propertyId: { in: ids } },
          select: {
            id: true,
            number: true,
            propertyId: true,
            status: true,
            createdAt: true,
            tenancies: { select: { status: true, endDate: true }, orderBy: { endDate: 'desc' } },
          },
          orderBy: { number: 'asc' },
        })
      : [];
    const blank = () => ({ units: 0, occupied: 0, notice: 0, vacant: 0, unavailable: 0 });
    const byProp = new Map(
      ids.map((id) => [
        id,
        { ...blank(), vacantUnits: [] as { id: string; number: string; vacantSince: string }[] },
      ]),
    );
    for (const u of units) {
      const r = byProp.get(u.propertyId)!;
      r.units++;
      const current = u.tenancies.find((t) => t.status !== 'ENDED');
      if (current?.status === 'ACTIVE') r.occupied++;
      else if (current?.status === 'NOTICE') r.notice++;
      else if (u.status === 'INACTIVE') r.unavailable++;
      else {
        r.vacant++;
        const lastOut = u.tenancies.find((t) => t.endDate)?.endDate;
        r.vacantUnits.push({
          id: u.id,
          number: u.number,
          vacantSince: formatDateOnly(lastOut ?? u.createdAt),
        });
      }
    }
    const rate = (r: ReturnType<typeof blank>) =>
      ratio(r.occupied + r.notice, r.units - r.unavailable);
    const totals = blank();
    const rows = props.map((p) => {
      const r = byProp.get(p.id)!;
      for (const k of Object.keys(totals) as (keyof ReturnType<typeof blank>)[]) totals[k] += r[k];
      return { property: p, ...r, rate: rate(r) };
    });
    return { rows, totals: { ...totals, rate: rate(totals) } };
  }

  // ── CSV ──

  pnlCsv(r: Awaited<ReturnType<ReportsService['propertyPnl']>>): string {
    const header = [
      'Property',
      'Rent invoiced',
      'Charges invoiced',
      'Move-in invoiced',
      'Other invoiced',
      'Total invoiced',
      'Collected',
      ...CATEGORIES.map((c) => `Expenses: ${c.toLowerCase()}`),
      'Total expenses',
      'Net (collected − expenses)',
    ];
    const line = (name: string, x: (typeof r.rows)[number] | (typeof r)['totals']) => [
      name,
      x.invoiced.rent,
      x.invoiced.charges,
      x.invoiced.moveIn,
      x.invoiced.other,
      x.invoiced.total,
      x.collected,
      ...CATEGORIES.map((c) => x.expenses[c] ?? 0n),
      x.expenses.total ?? 0n,
      x.net,
    ];
    return toCsv(header, [
      ...r.rows.map((x) => line(`${x.property.name} (${x.property.code})`, x)),
      line('Total', r.totals),
    ]);
  }

  arrearsCsv(r: Awaited<ReturnType<ReportsService['arrears']>>): string {
    return toCsv(
      [
        'Tenant',
        'Code',
        'Phone',
        'Units',
        'Not yet due',
        '1–30 days',
        '31–60 days',
        '61–90 days',
        'Over 90 days',
        'Total owed',
        'Credit',
      ],
      [
        ...r.rows.map((x) => [
          `${x.tenant.firstName} ${x.tenant.lastName}`,
          x.tenant.code,
          x.tenant.phone,
          x.units.join('; '),
          x.current,
          x.d1_30,
          x.d31_60,
          x.d61_90,
          x.d90plus,
          x.total,
          x.credit,
        ]),
        [
          'Total',
          '',
          '',
          '',
          r.totals.current,
          r.totals.d1_30,
          r.totals.d31_60,
          r.totals.d61_90,
          r.totals.d90plus,
          r.totals.total,
          r.totals.credit,
        ],
      ],
    );
  }

  occupancyCsv(r: Awaited<ReturnType<ReportsService['occupancy']>>): string {
    const pct = (v: number | null) => (v === null ? '' : `${(v * 100).toFixed(1)}%`);
    return toCsv(
      [
        'Property',
        'Units',
        'Occupied',
        'On notice',
        'Vacant',
        'Unavailable',
        'Occupancy',
        'Vacant units',
      ],
      [
        ...r.rows.map((x) => [
          `${x.property.name} (${x.property.code})`,
          x.units,
          x.occupied,
          x.notice,
          x.vacant,
          x.unavailable,
          pct(x.rate),
          x.vacantUnits.map((u) => `${u.number} (since ${u.vacantSince})`).join('; '),
        ]),
        [
          'Total',
          r.totals.units,
          r.totals.occupied,
          r.totals.notice,
          r.totals.vacant,
          r.totals.unavailable,
          pct(r.totals.rate),
          '',
        ],
      ],
    );
  }
}
