import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
// Pure helpers only — portfolio has no billing module dependency.
import { periodOf, todayInNairobi } from '../../billing/billing-math.js';
import { formatKesMinor, NotificationsService } from '../../notifications/notifications.service.js';
import { tenancyScope } from '../property-scope.js';
import { earliestChangePeriod, shortPeriodLabel, validateRentChange } from './rent-changes.js';
import type { RenewTenancyDto, RentChangeDto } from './tenancies.dto.js';
import { TenanciesService } from './tenancies.service.js';

/**
 * Scheduled rent changes and lease renewals (phase 13). A change only ever prices a month
 * that hasn't been invoiced; the invoice run applies it (`applyDue`) before billing that
 * month, and the run's preview prices with it already (see InvoiceBuilder).
 */
@Injectable()
export class RentChangesService {
  private readonly log = new Logger(RentChangesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly tenancies: TenanciesService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private async live(tenancyId: string) {
    const t = await this.db.tenancy.findFirst({
      where: { AND: [{ id: tenancyId }, tenancyScope()] },
      include: {
        tenant: { select: { firstName: true, phone: true, userId: true, id: true } },
        unit: { select: { number: true } },
      },
    });
    if (!t) throw AppError.notFound('Tenancy');
    if (t.status === 'ENDED') {
      throw AppError.conflict('This tenancy has ended', 'TENANCY_ENDED');
    }
    return t;
  }

  /** Renewing or re-pricing only makes sense for a tenant who is staying. */
  private async staying(tenancyId: string) {
    const t = await this.live(tenancyId);
    if (t.status === 'NOTICE') {
      throw AppError.conflict(
        'This tenant is under notice. Withdraw the notice first to renew the lease or change the rent.',
        'UNDER_NOTICE',
      );
    }
    return t;
  }

  /** The first month whose rent can still change for this tenancy. */
  private async earliest(tenancyId: string): Promise<string> {
    const last = await this.db.invoice.findFirst({
      where: { tenancyId, kind: 'MONTHLY', status: { not: 'VOID' } },
      orderBy: { period: 'desc' },
      select: { period: true },
    });
    return earliestChangePeriod({
      lastBilledPeriod: last?.period ?? null,
      currentPeriod: periodOf(todayInNairobi()),
    });
  }

  async schedule(tenancyId: string, dto: RentChangeDto) {
    const ctx = orgContext();
    const t = await this.staying(tenancyId);
    const earliest = await this.earliest(tenancyId);
    if (validateRentChange(dto.effectivePeriod, earliest) === 'ALREADY_BILLED') {
      throw AppError.conflict(
        `Rent for ${shortPeriodLabel(dto.effectivePeriod)} is already invoiced — choose ${shortPeriodLabel(earliest)} or later.`,
        'ALREADY_BILLED',
      );
    }
    const newRent = BigInt(dto.newRent);
    try {
      await this.db.$transaction(async (tx) => {
        await tx.rentChange.create({
          data: {
            orgId: ctx.orgId,
            tenancyId,
            effectivePeriod: dto.effectivePeriod,
            newRent,
            note: dto.note?.trim() || null,
            createdById: ctx.userId,
          },
        });
        await this.audit.record(
          {
            action: 'tenancy.rent_change_scheduled',
            entity: 'tenancy',
            entityId: tenancyId,
            before: { rentAmount: t.rentAmount },
            after: { newRent, effectivePeriod: dto.effectivePeriod, note: dto.note ?? null },
          },
          tx,
        );
      });
    } catch (e) {
      if (violatesUnique(e, 'effectivePeriod')) {
        throw AppError.conflict(
          `There is already a rent change from ${shortPeriodLabel(dto.effectivePeriod)}. Cancel it first to choose a different rent.`,
          'RENT_CHANGE_EXISTS',
        );
      }
      throw e;
    }
    if (dto.notifyTenant) await this.notify(t, newRent, dto.effectivePeriod);
    return this.tenancies.get(tenancyId);
  }

  async cancel(tenancyId: string, changeId: string) {
    await this.live(tenancyId);
    const change = await this.db.rentChange.findFirst({ where: { id: changeId, tenancyId } });
    if (!change) throw AppError.notFound('Rent change');
    if (change.appliedAt) {
      throw AppError.conflict(
        'This rent change has already been applied. Schedule another change instead.',
        'RENT_CHANGE_APPLIED',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.rentChange.delete({ where: { id: changeId } });
      await this.audit.record(
        {
          action: 'tenancy.rent_change_cancelled',
          entity: 'tenancy',
          entityId: tenancyId,
          before: { newRent: change.newRent, effectivePeriod: change.effectivePeriod },
          after: null,
        },
        tx,
      );
    });
  }

  /** A later lease end, optionally with a new rent from a chosen month. */
  async renew(tenancyId: string, dto: RenewTenancyDto) {
    const t = await this.staying(tenancyId);
    if (parseDateOnly(dto.leaseEndDate) <= t.startDate) {
      throw AppError.fieldInvalid('leaseEndDate', 'The lease must end after the move-in date');
    }
    if (dto.newRent !== undefined && !dto.effectivePeriod) {
      throw AppError.fieldInvalid('effectivePeriod', 'Choose the first month at the new rent');
    }
    if (dto.newRent !== undefined) {
      await this.schedule(tenancyId, {
        newRent: dto.newRent,
        effectivePeriod: dto.effectivePeriod!,
        note: 'Lease renewal',
        notifyTenant: dto.notifyTenant,
      });
    }
    return this.tenancies.setLeaseEnd(tenancyId, dto.leaseEndDate);
  }

  /**
   * Before a month is billed: every change that has started by `period` sets the tenancy's
   * rent (the latest one wins) and is marked applied. For the active organisation.
   */
  async applyDue(period: string): Promise<number> {
    const due = await this.db.rentChange.findMany({
      where: { appliedAt: null, effectivePeriod: { lte: period } },
      orderBy: { effectivePeriod: 'asc' },
      include: { tenancy: { select: { status: true, rentAmount: true } } },
    });
    const latest = new Map<string, (typeof due)[number]>();
    for (const c of due) latest.set(c.tenancyId, c);
    let applied = 0;
    for (const [tenancyId, change] of latest) {
      await this.db.$transaction(async (tx) => {
        if (change.tenancy.status !== 'ENDED') {
          await tx.tenancy.update({
            where: { id: tenancyId },
            data: { rentAmount: change.newRent },
          });
        }
        await tx.rentChange.updateMany({
          where: { tenancyId, appliedAt: null, effectivePeriod: { lte: period } },
          data: { appliedAt: new Date() },
        });
        await this.audit.record(
          {
            action: 'tenancy.rent_changed',
            entity: 'tenancy',
            entityId: tenancyId,
            before: { rentAmount: change.tenancy.rentAmount },
            after: { rentAmount: change.newRent, from: change.effectivePeriod },
          },
          tx,
        );
      });
      applied++;
    }
    return applied;
  }

  private async notify(
    t: {
      rentAmount: bigint;
      orgId: string;
      tenant: { id: string; firstName: string; phone: string; userId: string | null };
      unit: { number: string };
    },
    newRent: bigint,
    period: string,
  ) {
    if (!this.notifications) return;
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: t.orgId },
      select: { name: true },
    });
    const text = `Hi ${t.tenant.firstName}, your rent for ${t.unit.number} changes from KES ${formatKesMinor(t.rentAmount)} to KES ${formatKesMinor(newRent)} from ${shortPeriodLabel(period)}. ${org.name}`;
    try {
      await this.notifications.sendSms(
        { kind: 'org', orgId: t.orgId, type: 'rent_change' },
        t.tenant.phone,
        text,
      );
    } catch (err) {
      this.log.warn({ err, tenantId: t.tenant.id }, 'Rent change SMS failed');
    }
    if (t.tenant.userId) {
      await this.notifications.notifyUser({
        userId: t.tenant.userId,
        orgId: t.orgId,
        tenantId: t.tenant.id,
        kind: 'RENT_CHANGE',
        title: `Rent changes from ${shortPeriodLabel(period)}`,
        body: text,
        actionUrl: '/tenant',
      });
    }
  }
}
