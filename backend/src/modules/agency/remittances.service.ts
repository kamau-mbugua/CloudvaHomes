import { Inject, Injectable, Logger } from '@nestjs/common';
import { emptyContext, runWithContext } from '../../common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Prisma, Remittance } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { periodOf, todayInNairobi } from '../billing/billing-math.js';
import { nextCode } from '../portfolio/codes.js';
import { landlordScope } from '../portfolio/property-scope.js';
import { monthBounds } from '../reports/report-math.js';
import { covers, remittanceFor } from './agency-math.js';
import type {
  CancelRemittanceDto,
  ListRemittancesQueryDto,
  PayRemittanceDto,
} from './agency.dto.js';
import { LandlordLedgerService } from './landlord-ledger.service.js';
import { activeOrgId } from './org.js';

const LANDLORD = { landlord: { select: { id: true, code: true, name: true } } } as const;
type Row = Remittance & { landlord: { id: string; code: string; name: string } };

const stateError = (message: string) => AppError.conflict(message, 'REMITTANCE_STATE');

/**
 * Payouts to landlords (design §5.3): draft → approve (a different person) → paid, or
 * cancelled. Paying writes the REMITTANCE ledger entry, bringing the balance covered to zero.
 */
@Injectable()
export class RemittancesService {
  private readonly log = new Logger(RemittancesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LandlordLedgerService,
  ) {}

  private async view(rows: Row[]) {
    const ids = [
      ...new Set(
        rows
          .flatMap((r) => [r.draftedById, r.approvedById, r.paidById])
          .filter((x): x is string => !!x),
      ),
    ];
    const users = ids.length
      ? await this.db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const u = new Map(users.map((x) => [x.id, { id: x.id, name: `${x.firstName} ${x.lastName}` }]));
    const who = (id: string | null) => (id ? (u.get(id) ?? { id, name: 'Unknown user' }) : null);
    return rows.map((r) => {
      const activity = r.collections - r.commission - r.expenses + r.adjustments;
      const signedNet = r.direction === 'TO_LANDLORD' ? r.net : -r.net;
      return {
        id: r.id,
        number: r.number,
        landlord: r.landlord,
        period: r.period,
        direction: r.direction,
        broughtForward: signedNet - activity,
        collections: r.collections,
        commission: r.commission,
        expenses: r.expenses,
        adjustments: r.adjustments,
        net: r.net,
        status: r.status,
        draftedBy: who(r.draftedById),
        approvedBy: who(r.approvedById),
        approvedAt: r.approvedAt,
        paidBy: who(r.paidById),
        paidAt: r.paidAt,
        method: r.method,
        reference: r.reference,
        payoutMasked: r.payoutMasked,
        cancelledReason: r.cancelledReason,
        createdAt: r.createdAt,
      };
    });
  }

  async list(q: ListRemittancesQueryDto) {
    const where: Prisma.RemittanceWhereInput = {
      landlord: landlordScope(),
      ...(q.landlordId ? { landlordId: q.landlordId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.period ? { period: q.period } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.remittance.findMany({
        where,
        include: LANDLORD,
        orderBy: [{ createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.remittance.count({ where }),
    ]);
    return paginated(await this.view(rows), total, q);
  }

  async get(id: string) {
    return (await this.view([await this.find(id)]))[0]!;
  }

  /** Drafts the month's remittance: everything payable up to now, with what changed since the last one. */
  async draft(landlordId: string, period: string, userId: string | null) {
    const l = await this.ledger.findLandlord(landlordId);
    const orgId = activeOrgId();
    let id: string;
    try {
      id = await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "landlords" WHERE "id" = ${l.id}::uuid FOR UPDATE`;
        const open = await tx.remittance.findFirst({
          where: {
            landlordId: l.id,
            OR: [
              { status: { in: ['DRAFT', 'APPROVED'] } },
              { period, status: { not: 'CANCELLED' } },
            ],
          },
        });
        if (open) {
          throw AppError.conflict(
            open.period === period
              ? `There is already a remittance for ${period} (${open.number})`
              : `Finish or cancel ${open.number} before drafting another`,
            'REMITTANCE_EXISTS',
          );
        }
        const { start, end } = monthBounds(period);
        const agreements = (
          await tx.managementAgreement.findMany({ where: { landlordId: l.id } })
        ).filter(
          (a) =>
            covers(
              {
                startDate: formatDateOnly(a.startDate),
                endDate: a.endDate ? formatDateOnly(a.endDate) : null,
                propertyIds: [],
              },
              '',
              formatDateOnly(end),
            ) ||
            covers(
              {
                startDate: formatDateOnly(a.startDate),
                endDate: a.endDate ? formatDateOnly(a.endDate) : null,
                propertyIds: [],
              },
              '',
              formatDateOnly(start),
            ),
        );
        await this.ledger.bookFixedCommission(tx, l.id, period, agreements, userId);
        const cutoff = new Date();
        const previous = await tx.remittance.findFirst({
          where: { landlordId: l.id, status: { not: 'CANCELLED' } },
          orderBy: { cutoff: 'desc' },
          select: { cutoff: true },
        });
        const since = await tx.landlordLedgerEntry.groupBy({
          by: ['kind'],
          where: {
            landlordId: l.id,
            bucket: 'PAYABLE',
            createdAt: { lte: cutoff, ...(previous ? { gt: previous.cutoff } : {}) },
            kind: { not: 'REMITTANCE' },
          },
          _sum: { amount: true },
        });
        const sum = (k: string) => since.find((s) => s.kind === k)?._sum.amount ?? 0n;
        const balance = (await this.ledger.balances(tx, l.id, cutoff)).payable;
        const { direction, net } = remittanceFor(balance);
        const year = period.slice(0, 4);
        const row = await tx.remittance.create({
          data: {
            orgId,
            number: await nextCode(tx, orgId, `remittance:${year}`, `REM-${year}-`, 6),
            landlordId: l.id,
            period,
            direction,
            collections: sum('COLLECTION'),
            commission: -sum('COMMISSION'),
            expenses: -sum('EXPENSE'),
            adjustments: sum('ADJUSTMENT') + sum('DEPOSIT'),
            net,
            cutoff,
            draftedById: userId,
          },
        });
        await this.audit.record(
          {
            action: 'remittance.draft',
            entity: 'remittance',
            entityId: row.id,
            after: { number: row.number, period, direction, net },
          },
          tx,
        );
        return row.id;
      });
    } catch (e) {
      if (violatesUnique(e, 'remittances_one_live_per_period')) {
        throw AppError.conflict(`There is already a remittance for ${period}`, 'REMITTANCE_EXISTS');
      }
      throw e;
    }
    return this.get(id);
  }

  async approve(id: string) {
    const ctx = orgContext();
    const r = await this.find(id);
    if (r.status !== 'DRAFT') throw stateError('Only a draft can be approved');
    if (r.draftedById === ctx.userId) {
      throw AppError.conflict(
        'Someone other than the person who drafted it must approve it',
        'SAME_PERSON',
      );
    }
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.remittance.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'APPROVED', approvedById: ctx.userId, approvedAt: new Date() },
      });
      if (!count) throw stateError('Someone else just changed this remittance');
      await this.audit.record(
        {
          action: 'remittance.approve',
          entity: 'remittance',
          entityId: id,
          after: { number: r.number, net: r.net },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async pay(id: string, dto: PayRemittanceDto) {
    const ctx = orgContext();
    const r = await this.find(id);
    if (r.status !== 'APPROVED') throw stateError('Only an approved remittance can be marked paid');
    const paidAt = dto.paidAt ?? todayInNairobi();
    if (paidAt > todayInNairobi())
      throw AppError.fieldInvalid('paidAt', 'The date can’t be in the future');
    const landlord = await this.db.landlord.findUniqueOrThrow({ where: { id: r.landlordId } });
    const masked = landlord.payoutMethod === dto.method ? landlord.payoutHint : null;
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.remittance.updateMany({
        where: { id, status: 'APPROVED' },
        data: {
          status: 'PAID',
          paidById: ctx.userId,
          paidAt: parseDateOnly(paidAt),
          method: dto.method,
          reference: dto.reference.trim(),
          payoutMasked: masked,
        },
      });
      if (!count) throw stateError('Someone else just changed this remittance');
      await this.ledger.write(tx, {
        orgId: ctx.orgId,
        landlordId: r.landlordId,
        bucket: 'PAYABLE',
        kind: 'REMITTANCE',
        amount: r.direction === 'TO_LANDLORD' ? -r.net : r.net,
        remittanceId: id,
        occurredAt: paidAt,
        memo: `${r.number} ${r.direction === 'TO_LANDLORD' ? 'paid to the landlord' : 'received from the landlord'}, ref ${dto.reference.trim()}`,
        userId: ctx.userId,
      });
      await this.audit.record(
        {
          action: 'remittance.pay',
          entity: 'remittance',
          entityId: id,
          after: {
            number: r.number,
            net: r.net,
            method: dto.method,
            reference: dto.reference.trim(),
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async cancel(id: string, dto: CancelRemittanceDto) {
    const r = await this.find(id);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.remittance.updateMany({
        where: { id, status: { in: ['DRAFT', 'APPROVED'] } },
        data: { status: 'CANCELLED', cancelledReason: dto.reason.trim() },
      });
      if (!count) throw stateError('A paid or cancelled remittance can’t be cancelled');
      await this.audit.record(
        {
          action: 'remittance.cancel',
          entity: 'remittance',
          entityId: id,
          after: { number: r.number, reason: dto.reason.trim() },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async find(id: string): Promise<Row> {
    const r = await this.db.remittance.findFirst({
      where: { id, landlord: landlordScope() },
      include: LANDLORD,
    });
    if (!r) throw AppError.notFound('Remittance');
    return r;
  }

  /** Nightly: draft this month's remittance for landlords whose remittance day has come. */
  async draftDueAll(today = todayInNairobi()) {
    const period = periodOf(today);
    const day = Number(today.slice(8, 10));
    const agreements = await this.prisma.managementAgreement.findMany({
      where: {
        remittanceDay: { lte: day },
        startDate: { lte: parseDateOnly(today) },
        OR: [{ endDate: null }, { endDate: { gte: parseDateOnly(today) } }],
        landlord: { organization: { kind: 'AGENCY', status: { not: 'CLOSED' } } },
      },
      select: { orgId: true, landlordId: true },
    });
    const pairs = [...new Map(agreements.map((a) => [a.landlordId, a])).values()];
    let drafted = 0;
    for (const a of pairs) {
      const exists = await this.prisma.remittance.count({
        where: {
          landlordId: a.landlordId,
          OR: [{ period, status: { not: 'CANCELLED' } }, { status: { in: ['DRAFT', 'APPROVED'] } }],
        },
      });
      if (exists) continue;
      try {
        await runWithContext(emptyContext({ orgId: a.orgId }), () =>
          this.draft(a.landlordId, period, null),
        );
        drafted++;
      } catch (e) {
        this.log.error({ err: e, landlordId: a.landlordId }, 'Remittance draft failed');
      }
    }
    return { period, drafted };
  }
}
