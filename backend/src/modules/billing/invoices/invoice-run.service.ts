import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  currentContext,
  emptyContext,
  runWithContext,
} from '../../../common/context/request-context.js';
import { parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { tenancyScope } from '../../portfolio/property-scope.js';
import { isDueForRun, periodOf, todayInNairobi } from '../billing-math.js';
import { InvoiceBuilder } from './invoice-builder.js';
import { InvoiceIssuer } from './invoice-issuer.js';

const CANDIDATE_INCLUDE = {
  tenant: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
  unit: {
    select: {
      id: true,
      number: true,
      propertyId: true,
      property: { select: { id: true, code: true, name: true } },
    },
  },
} as const;

export const LIVE_INVOICE_INDEX = 'invoices_one_live_per_tenancy_period';

/**
 * The monthly invoice run (design §5.1). Idempotent: a tenancy is billed at most once per
 * month (live MONTHLY invoice, enforced by a unique index), so the scheduler firing twice, or
 * someone pressing "Run" after it, creates nothing new.
 */
@Injectable()
export class InvoiceRunService {
  private readonly log = new Logger(InvoiceRunService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly builder: InvoiceBuilder,
    private readonly issuer: InvoiceIssuer,
  ) {}

  /** `date` defaults to today in Nairobi; it may not be in the future. */
  resolveDate(date?: string): string {
    const today = todayInNairobi();
    const d = date ?? today;
    if (d > today) throw AppError.fieldInvalid('date', 'The run date can’t be in the future');
    return d;
  }

  /** Tenancies of the active organisation (and the caller's properties) due on `date`. */
  private async candidates(date: string) {
    const period = periodOf(date);
    const rows = await this.db.tenancy.findMany({
      where: {
        AND: [
          tenancyScope(),
          { status: { in: ['ACTIVE', 'NOTICE'] } },
          { startDate: { lte: parseDateOnly(date) } },
          { invoices: { none: { period, kind: 'MONTHLY', status: { not: 'VOID' } } } },
        ],
      },
      include: CANDIDATE_INCLUDE,
      orderBy: [{ unit: { property: { name: 'asc' } } }, { unit: { number: 'asc' } }],
    });
    return rows.filter((t) => isDueForRun(t, date));
  }

  async preview(date?: string) {
    const d = this.resolveDate(date);
    const period = periodOf(d);
    const items = [];
    for (const t of await this.candidates(d)) {
      const draft = await this.builder.monthly(t, period);
      items.push({
        tenancyId: t.id,
        tenant: t.tenant,
        unit: { id: t.unit.id, number: t.unit.number },
        property: t.unit.property,
        lines: draft.lines.map((l) => ({
          kind: l.kind,
          description: l.description,
          quantity: l.quantity,
          unitAmount: l.unitAmount,
          amount: l.amount,
        })),
        total: draft.lines.reduce((s, l) => s + l.amount, 0n),
        missingReadings: draft.missingReadings,
      });
    }
    return {
      date: d,
      period,
      items,
      total: items.reduce((s, i) => s + i.total, 0n),
    };
  }

  /** Issues the month's invoices for the active organisation, one transaction per tenancy. */
  async run(date?: string) {
    const d = this.resolveDate(date);
    const period = periodOf(d);
    const ctx = currentContext();
    const orgId = ctx?.orgId;
    if (!orgId) throw new Error('Invoice run needs an active organisation');
    const invoiceIds: string[] = [];
    for (const t of await this.candidates(d)) {
      try {
        const id = await this.db.$transaction(async (tx) => {
          const draft = await this.builder.monthly(t, period, tx);
          return this.issuer.issue(tx, {
            orgId,
            tenancy: t,
            kind: 'MONTHLY',
            period,
            issueDate: parseDateOnly(d),
            lines: draft.lines,
            createdById: ctx.userId,
          });
        });
        invoiceIds.push(id);
      } catch (e) {
        // Another run billed it between our read and write: nothing to do.
        if (violatesUnique(e, LIVE_INVOICE_INDEX)) continue;
        throw e;
      }
    }
    return { date: d, period, created: invoiceIds.length, invoiceIds };
  }

  /**
   * The scheduled job: every organisation that isn't closed, each in its own context so
   * org scoping applies and one failure doesn't stop the others.
   */
  async runAll(date?: string) {
    const d = this.resolveDate(date);
    const orgs = await this.prisma.organization.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true },
    });
    let created = 0;
    const failed: string[] = [];
    for (const org of orgs) {
      try {
        const res = await runWithContext(emptyContext({ orgId: org.id }), () => this.run(d));
        created += res.created;
      } catch (e) {
        failed.push(org.id);
        this.log.error({ err: e, orgId: org.id }, 'Invoice run failed for an organisation');
      }
    }
    return { date: d, organizations: orgs.length, created, failed };
  }
}
