import { Inject, Injectable } from '@nestjs/common';
import { currentContext, runWithContext } from '../../common/context/request-context.js';
import { formatDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { periodOf, todayInNairobi } from '../billing/billing-math.js';
import { monthBounds } from '../reports/report-math.js';
import { ReportsService } from '../reports/reports.service.js';
import { LandlordLedgerService } from './landlord-ledger.service.js';

/** Runs `fn` limited to one landlord's properties (reuses the property-scoped reports). */
export function asLandlordScope<T>(propertyIds: string[], fn: () => Promise<T>): Promise<T> {
  const ctx = currentContext()!;
  // A landlord with no properties must see nothing, not everything.
  const ids = propertyIds.length ? propertyIds : ['00000000-0000-0000-0000-000000000000'];
  return runWithContext({ ...ctx, propertyIds: ids }, fn);
}

/** Owner statement (design §5.3): what was collected, deducted and paid out for a landlord. */
@Injectable()
export class StatementsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ledger: LandlordLedgerService,
    private readonly reports: ReportsService,
  ) {}

  async statement(landlordId: string, q: { from?: string; to?: string }) {
    const l = await this.ledger.findLandlord(landlordId);
    const month = periodOf(todayInNairobi());
    const from = q.from ?? q.to ?? month;
    const to = q.to ?? q.from ?? month;
    if (from > to) throw AppError.fieldInvalid('from', 'The first month must be before the last');
    const start = monthBounds(from).start;
    const end = monthBounds(to).end;

    const opening = await this.db.landlordLedgerEntry.groupBy({
      by: ['bucket'],
      where: { landlordId: l.id, occurredAt: { lt: start } },
      _sum: { amount: true },
    });
    const open = (b: string) => opening.find((o) => o.bucket === b)?._sum.amount ?? 0n;
    const rows = await this.db.landlordLedgerEntry.findMany({
      where: { landlordId: l.id, occurredAt: { gte: start, lte: end } },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const entries = await this.ledger.describe(rows.map((r) => r.id));
    const totals = {
      collections: 0n,
      commission: 0n,
      expenses: 0n,
      remittances: 0n,
      adjustments: 0n,
    };
    let payable = open('PAYABLE');
    let deposits = open('DEPOSIT_HELD');
    const lines = entries.map((e) => {
      if (e.bucket === 'PAYABLE') {
        payable += e.amount;
        if (e.kind === 'COLLECTION') totals.collections += e.amount;
        else if (e.kind === 'COMMISSION') totals.commission -= e.amount;
        else if (e.kind === 'EXPENSE') totals.expenses -= e.amount;
        else if (e.kind === 'REMITTANCE') totals.remittances -= e.amount;
        else totals.adjustments += e.amount;
      } else deposits += e.amount;
      return { ...e, balance: e.bucket === 'PAYABLE' ? payable : deposits };
    });
    const properties = await this.db.property.findMany({
      where: { landlordId: l.id },
      select: { id: true },
    });
    const ids = properties.map((p) => p.id);
    const [occupancy, arrears] = await asLandlordScope(
      ids,
      async () => [await this.reports.occupancy({}), await this.reports.arrears({})] as const,
    );
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: l.orgId },
      select: { name: true, phone: true, email: true, kraPin: true },
    });
    return {
      landlord: { id: l.id, code: l.code, name: l.name },
      organization: org,
      from,
      to,
      period: { start: formatDateOnly(start), end: formatDateOnly(end) },
      opening: { payable: open('PAYABLE'), depositHeld: open('DEPOSIT_HELD') },
      entries: lines,
      totals,
      closing: { payable, depositHeld: deposits },
      occupancy,
      arrears: {
        totals: arrears.totals,
        rows: arrears.rows.map((r) => ({
          tenant: {
            code: r.tenant.code,
            firstName: r.tenant.firstName,
            lastName: r.tenant.lastName,
          },
          units: r.units,
          total: r.total,
          overdue: r.total - r.current,
        })),
      },
    };
  }
}
