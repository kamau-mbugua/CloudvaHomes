import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  currentContext,
  emptyContext,
  runWithContext,
} from '../../../common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import type { LateFeeRecipient } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { addDays, balanceOf, todayInNairobi } from '../billing-math.js';
import { InvoiceIssuer } from '../invoices/invoice-issuer.js';
import { LIVE_INVOICE_INDEX } from '../invoices/invoice-run.service.js';
import { lateFeeFor, readLateFees } from './late-fees.js';

/**
 * Whether a property may be charged late fees, and who keeps them. Agencies register this
 * (billing must not import agency): their properties get fees only once the management
 * agreement says who keeps them (owner decision 2026-11-04, no default).
 */
export type LateFeeEligibility = (
  tx: Tx,
  invoice: { propertyId: string; date: string },
) => Promise<{ allowed: boolean; keptBy: LateFeeRecipient | null }>;

@Injectable()
export class LateFeesService {
  private readonly log = new Logger(LateFeesService.name);
  private eligibility: LateFeeEligibility | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly issuer: InvoiceIssuer,
  ) {}

  onEligibility(hook: LateFeeEligibility) {
    this.eligibility = hook;
  }

  /**
   * Today's late fees for the active organisation: one LATE_FEE invoice per overdue MONTHLY
   * invoice, in the same period, linked by `lateFeeForId`. Safe to repeat.
   */
  async run(today = todayInNairobi()): Promise<{ created: number; skippedNoAgreement: number }> {
    const ctx = currentContext();
    const orgId = ctx?.orgId;
    if (!orgId) throw new Error('Late fees need an active organisation');
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = readLateFees(org.settings);
    if (!settings.enabled) return { created: 0, skippedNoAgreement: 0 };

    const latestDue = addDays(parseDateOnly(today), -settings.graceDays);
    const overdue = await this.db.invoice.findMany({
      where: {
        kind: 'MONTHLY',
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueDate: { lte: latestDue },
      },
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        period: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        creditedAmount: true,
        propertyId: true,
        tenancy: {
          select: {
            id: true,
            tenantId: true,
            unitId: true,
            unit: { select: { propertyId: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    const charged = new Set(
      (
        await this.db.invoice.findMany({
          where: { lateFeeForId: { in: overdue.map((i) => i.id) } },
          select: { lateFeeForId: true },
        })
      ).map((i) => i.lateFeeForId),
    );

    let created = 0;
    let skippedNoAgreement = 0;
    for (const inv of overdue) {
      if (charged.has(inv.id)) continue;
      const fee = lateFeeFor(
        {
          kind: inv.kind,
          status: inv.status,
          dueDate: formatDateOnly(inv.dueDate),
          balance: balanceOf(inv),
        },
        settings,
        today,
      );
      if (fee === null) continue;
      try {
        const made = await this.db.$transaction(async (tx) => {
          const who = this.eligibility
            ? await this.eligibility(tx, { propertyId: inv.propertyId, date: today })
            : { allowed: true, keptBy: null };
          if (!who.allowed) return false;
          await this.issuer.issue(tx, {
            orgId,
            tenancy: inv.tenancy,
            kind: 'LATE_FEE',
            period: inv.period,
            issueDate: parseDateOnly(today),
            lines: [
              {
                kind: 'LATE_FEE',
                description: `Late payment fee for ${inv.number}`,
                quantity: '1.000',
                unitAmount: fee,
                amount: fee,
              },
            ],
            createdById: ctx.userId ?? null,
            lateFee: { forId: inv.id, keptBy: who.keptBy },
          });
          return true;
        });
        if (made) created++;
        else skippedNoAgreement++;
      } catch (e) {
        // Another run charged it between our read and write: nothing to do.
        if (violatesUnique(e, 'lateFeeForId') || violatesUnique(e, LIVE_INVOICE_INDEX)) continue;
        throw e;
      }
    }
    return { created, skippedNoAgreement };
  }

  /** The scheduled job: every organisation that isn't closed, each in its own context. */
  async runAll(today = todayInNairobi()) {
    const orgs = await this.prisma.organization.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true },
    });
    let created = 0;
    const failed: string[] = [];
    for (const org of orgs) {
      try {
        const res = await runWithContext(emptyContext({ orgId: org.id }), () => this.run(today));
        created += res.created;
      } catch (e) {
        failed.push(org.id);
        this.log.error({ err: e, orgId: org.id }, 'Late fees failed for an organisation');
      }
    }
    return { date: today, organizations: orgs.length, created, failed };
  }
}
