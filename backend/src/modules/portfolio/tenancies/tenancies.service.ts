import { Inject, Injectable } from '@nestjs/common';
import {
  formatDateOnly,
  formatDateOnlyOrNull,
  parseDateOnly,
} from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import type { Prisma, TenancyStatus } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { tenancyScope } from '../property-scope.js';
import { mapTenantConflict, TenantsService } from '../tenants/tenants.service.js';
import { CURRENT, lockUnit, UnitsService } from '../units/units.service.js';
import type {
  CreateTenancyDto,
  ListTenanciesQueryDto,
  MoveOutDto,
  NoticeDto,
  UpdateTenancyDto,
} from './tenancies.dto.js';

const INCLUDE = {
  tenant: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
  unit: {
    select: { id: true, number: true, property: { select: { id: true, code: true, name: true } } },
  },
} satisfies Prisma.TenancyInclude;

type TenancyRow = Prisma.TenancyGetPayload<{ include: typeof INCLUDE }>;

/** Rent is billed on the move-in day of the month, capped at 28 so every month has it. */
export function defaultBillingDay(start: Date): number {
  return Math.min(start.getUTCDate(), 28);
}

function toTenancy(t: TenancyRow) {
  return {
    id: t.id,
    status: t.status,
    rentAmount: t.rentAmount,
    billingDay: t.billingDay,
    startDate: formatDateOnly(t.startDate),
    endDate: formatDateOnlyOrNull(t.endDate),
    noticeGivenAt: t.noticeGivenAt,
    depositHeld: t.depositHeld,
    moveOutReason: t.moveOutReason,
    tenant: t.tenant,
    unit: t.unit,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function snapshot(t: TenancyRow) {
  return {
    tenantId: t.tenantId,
    tenantCode: t.tenant.code,
    unitId: t.unitId,
    unitNumber: t.unit.number,
    propertyCode: t.unit.property.code,
    status: t.status,
    rentAmount: t.rentAmount,
    billingDay: t.billingDay,
    startDate: formatDateOnly(t.startDate),
    endDate: formatDateOnlyOrNull(t.endDate),
    depositHeld: t.depositHeld,
    moveOutReason: t.moveOutReason,
  };
}

const unitOccupied = () => AppError.conflict('Someone already lives in this unit', 'UNIT_OCCUPIED');
const tenancyEnded = () =>
  AppError.conflict('This tenancy has ended and can no longer change', 'TENANCY_ENDED');

export interface MovedInTenancy {
  id: string;
  tenantId: string;
  unitId: string;
  rentAmount: bigint;
  startDate: Date;
  unit: { propertyId: string };
}

/** Runs inside the move-in transaction (billing issues the move-in invoice here). */
export type MoveInHook = (
  tx: Tx,
  tenancy: MovedInTenancy,
  wanted: boolean | undefined,
) => Promise<void>;

/**
 * Who lives where, and when (design §5.1): move-in, notice, move-out. One current
 * (ACTIVE/NOTICE) tenancy per unit, enforced by a row lock here and a partial unique index.
 */
@Injectable()
export class TenanciesService {
  private readonly moveInHooks: MoveInHook[] = [];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    private readonly tenants: TenantsService,
  ) {}

  /** Lets later modules join the move-in transaction without portfolio depending on them. */
  onMoveIn(hook: MoveInHook): void {
    this.moveInHooks.push(hook);
  }

  async list(q: ListTenanciesQueryDto) {
    const term = q.q?.trim();
    const where: Prisma.TenancyWhereInput = {
      AND: [
        tenancyScope(),
        q.status ? { status: q.status } : {},
        q.propertyId ? { unit: { propertyId: q.propertyId } } : {},
        q.unitId ? { unitId: q.unitId } : {},
        q.tenantId ? { tenantId: q.tenantId } : {},
        term
          ? {
              OR: [
                { unit: { number: { contains: term, mode: 'insensitive' } } },
                {
                  tenant: {
                    OR: [
                      { firstName: { contains: term, mode: 'insensitive' } },
                      { lastName: { contains: term, mode: 'insensitive' } },
                      { code: { contains: term, mode: 'insensitive' } },
                      { phone: { contains: term.replace(/\s/g, '') } },
                    ],
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.tenancy.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.tenancy.count({ where }),
    ]);
    return paginated(rows.map(toTenancy), total, q);
  }

  async get(id: string) {
    return toTenancy(await this.find(id));
  }

  async moveIn(dto: CreateTenancyDto) {
    const ctx = orgContext();
    if (!!dto.tenantId === !!dto.tenant) {
      throw AppError.fieldInvalid('tenantId', 'Choose an existing tenant or add a new one');
    }
    if (dto.tenant && !ctx.permissions.has('tenants:create')) throw AppError.forbidden();
    const unit = await this.units.find(dto.unitId);
    if (unit.status !== 'ACTIVE') {
      throw AppError.conflict('This unit is marked unavailable', 'UNIT_INACTIVE');
    }
    if (dto.tenantId) await this.tenants.find(dto.tenantId);
    const start = parseDateOnly(dto.startDate);

    try {
      const id = await this.db.$transaction(async (tx) => {
        await lockUnit(tx, unit.id);
        const current = await tx.tenancy.count({
          where: { unitId: unit.id, status: { in: [...CURRENT] } },
        });
        if (current) throw unitOccupied();
        // History must not overlap: the new tenant can't move in before the last one left.
        const last = await tx.tenancy.findFirst({
          where: { unitId: unit.id, status: 'ENDED', endDate: { gt: start } },
          orderBy: { endDate: 'desc' },
          select: { endDate: true },
        });
        if (last?.endDate) {
          throw AppError.fieldInvalid(
            'startDate',
            `The previous tenant moved out on ${formatDateOnly(last.endDate)}; start on or after that day`,
          );
        }
        const tenantId = dto.tenantId ?? (await this.tenants.createInTx(tx, dto.tenant!));
        const created = await tx.tenancy.create({
          data: {
            orgId: ctx.orgId,
            tenantId,
            unitId: unit.id,
            rentAmount: dto.rentAmount !== undefined ? BigInt(dto.rentAmount) : unit.rentAmount,
            billingDay: dto.billingDay ?? defaultBillingDay(start),
            startDate: start,
            depositHeld: BigInt(dto.depositHeld ?? 0),
          },
          include: INCLUDE,
        });
        await this.audit.record(
          {
            action: 'tenancy.move_in',
            entity: 'tenancy',
            entityId: created.id,
            after: snapshot(created),
          },
          tx,
        );
        if (created.depositHeld > 0n) {
          // Opening entry of the deposit ledger (phase 4): held before Hodi.
          await tx.depositTransaction.create({
            data: {
              orgId: ctx.orgId,
              tenancyId: created.id,
              kind: 'OPENING',
              amount: created.depositHeld,
              note: 'Deposit held before Hodi',
              createdById: ctx.userId,
            },
          });
        }
        const moved = { ...created, unit: { propertyId: unit.propertyId } };
        for (const hook of this.moveInHooks) await hook(tx, moved, dto.issueMoveInInvoice);
        return created.id;
      });
      return this.get(id);
    } catch (e) {
      if (violatesUnique(e, 'tenancies_one_current_per_unit')) throw unitOccupied();
      throw mapTenantConflict(e);
    }
  }

  async update(id: string, dto: UpdateTenancyDto) {
    return this.transition(id, ['ACTIVE', 'NOTICE'], 'tenancy.update', () => ({
      ...(dto.rentAmount !== undefined ? { rentAmount: BigInt(dto.rentAmount) } : {}),
      ...(dto.billingDay !== undefined ? { billingDay: dto.billingDay } : {}),
    }));
  }

  async giveNotice(id: string, dto: NoticeDto) {
    const end = parseDateOnly(dto.endDate);
    return this.transition(id, ['ACTIVE', 'NOTICE'], 'tenancy.notice', (t) => {
      assertNotBefore(end, t.startDate);
      return { status: 'NOTICE', endDate: end, noticeGivenAt: t.noticeGivenAt ?? new Date() };
    });
  }

  async withdrawNotice(id: string) {
    return this.transition(id, ['NOTICE'], 'tenancy.notice_withdraw', () => ({
      status: 'ACTIVE',
      endDate: null,
      noticeGivenAt: null,
    }));
  }

  async moveOut(id: string, dto: MoveOutDto) {
    const end = parseDateOnly(dto.endDate);
    return this.transition(id, ['ACTIVE', 'NOTICE'], 'tenancy.move_out', (t) => {
      assertNotBefore(end, t.startDate);
      return { status: 'ENDED', endDate: end, moveOutReason: dto.reason?.trim() || null };
    });
  }

  /** For records entered by mistake: only while nothing (still valid) has been invoiced. */
  async remove(id: string) {
    const t = await this.find(id);
    await this.db.$transaction(async (tx) => {
      if (await tx.invoice.count({ where: { tenancyId: id, status: { not: 'VOID' } } })) {
        throw AppError.conflict(
          'This tenancy has invoices. Void them first, or record a move-out instead.',
          'TENANCY_INVOICED',
        );
      }
      await tx.tenancy.delete({ where: { id } });
      await this.audit.record(
        { action: 'tenancy.delete', entity: 'tenancy', entityId: id, before: snapshot(t) },
        tx,
      );
    });
  }

  private async find(id: string): Promise<TenancyRow> {
    const t = await this.db.tenancy.findFirst({
      where: { AND: [{ id }, tenancyScope()] },
      include: INCLUDE,
    });
    if (!t) throw AppError.notFound('Tenancy');
    return t;
  }

  /**
   * Applies a change only if the tenancy is still in one of `from` when the write lands (a
   * conditional update), so two people ending the same tenancy can't both succeed.
   */
  private async transition(
    id: string,
    from: TenancyStatus[],
    action: string,
    change: (t: TenancyRow) => Prisma.TenancyUpdateManyMutationInput,
  ) {
    const before = await this.find(id);
    if (!from.includes(before.status)) {
      throw before.status === 'ENDED'
        ? tenancyEnded()
        : AppError.conflict('This tenancy is not under notice', 'NOT_UNDER_NOTICE');
    }
    const data = change(before);
    const updated = await this.db.$transaction(async (tx) => {
      const { count } = await tx.tenancy.updateMany({
        where: { id, status: { in: from } },
        data,
      });
      if (!count) throw AppError.conflict('Someone else just changed this tenancy', 'CONFLICT');
      const after = await tx.tenancy.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      await this.audit.record(
        {
          action,
          entity: 'tenancy',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
    return toTenancy(updated);
  }
}

function assertNotBefore(end: Date, start: Date) {
  if (end < start) {
    throw AppError.fieldInvalid('endDate', 'The move-out date can’t be before the move-in date');
  }
}
