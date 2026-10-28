import { Inject, Injectable } from '@nestjs/common';
import {
  formatDateOnly,
  formatDateOnlyOrNull,
  parseDateOnly,
} from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import type { ManagementAgreement, Prisma } from '../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { requireAgency } from '../portfolio/fields.js';
import { landlordScope } from '../portfolio/property-scope.js';
import { covers, overlaps } from './agency-math.js';
import type {
  CreateAgreementDto,
  ListAgreementsQueryDto,
  UpdateAgreementDto,
} from './agency.dto.js';

const LANDLORD = { landlord: { select: { id: true, code: true, name: true } } } as const;
type Row = ManagementAgreement & { landlord: { id: string; code: string; name: string } };

const range = (a: ManagementAgreement) => ({
  startDate: formatDateOnly(a.startDate),
  endDate: formatDateOnlyOrNull(a.endDate),
  propertyIds: a.propertyIds,
});

export function toAgreement(a: Row, today = todayInNairobi()) {
  return {
    id: a.id,
    landlord: a.landlord,
    commissionBasis: a.commissionBasis,
    commissionBps: a.commissionBps,
    fixedAmount: a.fixedAmount,
    commissionableLines: a.commissionableLines,
    collection: a.collection,
    remittanceDay: a.remittanceDay,
    deductExpenses: a.deductExpenses,
    holdDeposits: a.holdDeposits,
    ...range(a),
    active: covers({ ...range(a), propertyIds: [] }, '', today),
    createdAt: a.createdAt,
  };
}

/** Management agreements (design §5.3). Terms never change under a statement already issued. */
@Injectable()
export class AgreementsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** The agreement covering a landlord's property on a date, or null. */
  async applicable(client: Db | Tx, landlordId: string, propertyId: string, date: string) {
    const rows = await client.managementAgreement.findMany({
      where: { landlordId, startDate: { lte: parseDateOnly(date) } },
      orderBy: { startDate: 'desc' },
    });
    return rows.find((a) => covers(range(a), propertyId, date)) ?? null;
  }

  async list(q: ListAgreementsQueryDto) {
    await requireAgency(this.db);
    const today = parseDateOnly(todayInNairobi());
    const rows = await this.db.managementAgreement.findMany({
      where: {
        landlord: landlordScope(),
        ...(q.landlordId ? { landlordId: q.landlordId } : {}),
        ...(q.active
          ? { startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] }
          : {}),
      },
      include: LANDLORD,
      orderBy: [{ landlord: { name: 'asc' } }, { startDate: 'desc' }],
    });
    return rows.map((r) => toAgreement(r));
  }

  async create(dto: CreateAgreementDto) {
    await requireAgency(this.db);
    const { orgId } = orgContext();
    const landlord = await this.db.landlord.findFirst({
      where: { AND: [{ id: dto.landlordId }, landlordScope()] },
    });
    if (!landlord) throw AppError.notFound('Landlord');
    const terms = this.terms(dto.commissionBasis, dto.commissionBps, dto.fixedAmount);
    if (dto.propertyIds?.length) {
      const owned = await this.db.property.count({
        where: { id: { in: dto.propertyIds }, landlordId: landlord.id },
      });
      if (owned !== new Set(dto.propertyIds).size) {
        throw AppError.fieldInvalid('propertyIds', 'Choose properties of this landlord');
      }
    }
    if (dto.endDate && dto.endDate < dto.startDate)
      throw AppError.fieldInvalid('endDate', 'The end must be after the start');
    const candidate = {
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      propertyIds: [...new Set(dto.propertyIds ?? [])],
    };
    const row = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "landlords" WHERE "id" = ${landlord.id}::uuid FOR UPDATE`;
      await this.assertNoOverlap(tx, landlord.id, candidate);
      const created = await tx.managementAgreement.create({
        data: {
          orgId,
          landlordId: landlord.id,
          propertyIds: candidate.propertyIds,
          ...terms,
          commissionableLines: dto.commissionableLines ?? ['RENT'],
          collection: dto.collection ?? 'AGENCY_COLLECTS',
          remittanceDay: dto.remittanceDay,
          deductExpenses: dto.deductExpenses ?? true,
          holdDeposits: dto.holdDeposits ?? true,
          startDate: parseDateOnly(dto.startDate),
          endDate: dto.endDate ? parseDateOnly(dto.endDate) : null,
        },
        include: LANDLORD,
      });
      await this.audit.record(
        {
          action: 'agreement.create',
          entity: 'agreement',
          entityId: created.id,
          after: toAgreement(created),
        },
        tx,
      );
      return created;
    });
    return toAgreement(row);
  }

  async update(id: string, dto: UpdateAgreementDto) {
    const before = await this.find(id);
    const used = await this.db.landlordLedgerEntry.count({ where: { agreementId: id } });
    const termsChanging = Object.entries(dto).some(([k, v]) => k !== 'endDate' && v !== undefined);
    if (used && termsChanging) {
      throw AppError.conflict(
        'Money was already booked under these terms. End this agreement and start a new one.',
        'AGREEMENT_IN_USE',
      );
    }
    const endDate = dto.endDate === undefined ? undefined : dto.endDate || null;
    if (endDate && endDate < formatDateOnly(before.startDate)) {
      throw AppError.fieldInvalid('endDate', 'The end must be after the start');
    }
    const terms =
      dto.commissionBps !== undefined || dto.fixedAmount !== undefined
        ? this.terms(
            before.commissionBasis,
            dto.commissionBps ?? before.commissionBps ?? undefined,
            dto.fixedAmount ??
              (before.fixedAmount !== null ? Number(before.fixedAmount) : undefined),
          )
        : {};
    const row = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "landlords" WHERE "id" = ${before.landlordId}::uuid FOR UPDATE`;
      if (endDate !== undefined) {
        await this.assertNoOverlap(tx, before.landlordId, { ...range(before), endDate }, id);
      }
      const updated = await tx.managementAgreement.update({
        where: { id },
        data: {
          ...terms,
          ...(endDate !== undefined ? { endDate: endDate ? parseDateOnly(endDate) : null } : {}),
          ...(dto.commissionableLines ? { commissionableLines: dto.commissionableLines } : {}),
          ...(dto.collection ? { collection: dto.collection } : {}),
          ...(dto.remittanceDay ? { remittanceDay: dto.remittanceDay } : {}),
          ...(dto.deductExpenses !== undefined ? { deductExpenses: dto.deductExpenses } : {}),
          ...(dto.holdDeposits !== undefined ? { holdDeposits: dto.holdDeposits } : {}),
        },
        include: LANDLORD,
      });
      await this.audit.record(
        {
          action: 'agreement.update',
          entity: 'agreement',
          entityId: id,
          before: toAgreement(before),
          after: toAgreement(updated),
        },
        tx,
      );
      return updated;
    });
    return toAgreement(row);
  }

  async remove(id: string) {
    const before = await this.find(id);
    if (await this.db.landlordLedgerEntry.count({ where: { agreementId: id } })) {
      throw AppError.conflict(
        'Money was booked under this agreement. Set an end date instead.',
        'AGREEMENT_IN_USE',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.managementAgreement.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'agreement.delete',
          entity: 'agreement',
          entityId: id,
          before: toAgreement(before),
        },
        tx,
      );
    });
  }

  private async find(id: string): Promise<Row> {
    await requireAgency(this.db);
    const a = await this.db.managementAgreement.findFirst({
      where: { id, landlord: landlordScope() },
      include: LANDLORD,
    });
    if (!a) throw AppError.notFound('Agreement');
    return a;
  }

  private terms(
    basis: ManagementAgreement['commissionBasis'],
    bps?: number | null,
    fixed?: number,
  ) {
    if (basis === 'FIXED_MONTHLY') {
      if (fixed === undefined)
        throw AppError.fieldInvalid('fixedAmount', 'Enter the monthly commission');
      return {
        commissionBasis: basis,
        fixedAmount: BigInt(fixed),
        commissionBps: null,
      } satisfies Partial<Prisma.ManagementAgreementUncheckedCreateInput>;
    }
    if (bps === undefined || bps === null)
      throw AppError.fieldInvalid('commissionBps', 'Enter the commission rate');
    return { commissionBasis: basis, commissionBps: bps, fixedAmount: null };
  }

  private async assertNoOverlap(
    tx: Tx,
    landlordId: string,
    candidate: ReturnType<typeof range>,
    exceptId?: string,
  ) {
    const others = await tx.managementAgreement.findMany({
      where: { landlordId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (others.some((o) => overlaps(range(o), candidate))) {
      throw AppError.conflict(
        'Another agreement already covers this landlord’s properties for some of these dates. End it first.',
        'AGREEMENT_OVERLAP',
      );
    }
  }
}
