import { Inject, Injectable } from '@nestjs/common';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { formatDateOnlyOrNull, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Organization, Plan, Prisma } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { PlatformBillingService } from './platform-billing.service.js';
import type {
  CreatePlanDto,
  ListOrgsQueryDto,
  UpdateOrgBillingDto,
  UpdatePlanDto,
} from './platform.dto.js';

/** Plans and per-organisation billing terms, managed by platform admins. */
@Injectable()
export class PlatformAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly billing: PlatformBillingService,
  ) {}

  // ── Plans ──

  private async toPlan(p: Plan) {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      pricePerUnit: p.pricePerUnit,
      minimumMonthly: p.minimumMonthly,
      trialDays: p.trialDays,
      isDefault: p.isDefault,
      active: p.active,
      organizationCount: await this.db.organization.count({ where: { planId: p.id } }),
      createdAt: p.createdAt,
    };
  }

  async plans() {
    const rows = await this.db.plan.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return Promise.all(rows.map((p) => this.toPlan(p)));
  }

  createPlan(dto: CreatePlanDto) {
    return withoutOrgScope(() =>
      this.savePlan(null, {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        pricePerUnit: BigInt(dto.pricePerUnit),
        minimumMonthly: BigInt(dto.minimumMonthly ?? 0),
        trialDays: dto.trialDays ?? 30,
        isDefault: dto.isDefault ?? false,
      }),
    );
  }

  updatePlan(id: string, dto: UpdatePlanDto) {
    return withoutOrgScope(async () => {
      const plan = await this.db.plan.findUnique({ where: { id } });
      if (!plan) throw AppError.notFound('Plan');
      if (dto.active === false && (dto.isDefault ?? plan.isDefault)) {
        throw AppError.fieldInvalid(
          'active',
          'Choose another default plan before switching this one off',
        );
      }
      return this.savePlan(id, {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.pricePerUnit !== undefined ? { pricePerUnit: BigInt(dto.pricePerUnit) } : {}),
        ...(dto.minimumMonthly !== undefined ? { minimumMonthly: BigInt(dto.minimumMonthly) } : {}),
        ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      });
    });
  }

  private async savePlan(
    id: string | null,
    data: Prisma.PlanUncheckedCreateInput | Prisma.PlanUncheckedUpdateInput,
  ) {
    try {
      const plan = await this.db.$transaction(async (tx) => {
        // One default at a time; it is also the one new organisations get.
        if (data.isDefault === true) {
          await tx.plan.updateMany({
            where: { isDefault: true, ...(id ? { id: { not: id } } : {}) },
            data: { isDefault: false },
          });
        }
        const before = id ? await tx.plan.findUniqueOrThrow({ where: { id } }) : null;
        const row = id
          ? await tx.plan.update({ where: { id }, data: data as Prisma.PlanUncheckedUpdateInput })
          : await tx.plan.create({ data: data as Prisma.PlanUncheckedCreateInput });
        if (data.isDefault === true) {
          await tx.platformSettings.upsert({
            where: { id: 1 },
            create: { id: 1, defaultPlanId: row.id },
            update: { defaultPlanId: row.id },
          });
        } else if (before?.isDefault && data.isDefault === false) {
          await tx.platformSettings.updateMany({
            where: { id: 1, defaultPlanId: row.id },
            data: { defaultPlanId: null },
          });
        }
        await this.audit.record(
          {
            action: id ? 'plan.update' : 'plan.create',
            entity: 'plan',
            entityId: row.id,
            orgId: null,
            before: before ?? undefined,
            after: row,
          },
          tx,
        );
        return row;
      });
      return this.toPlan(plan);
    } catch (e) {
      if (violatesUnique(e, 'name'))
        throw AppError.fieldInvalid('name', 'A plan with this name exists');
      throw e;
    }
  }

  deletePlan(id: string) {
    return withoutOrgScope(async () => {
      const plan = await this.db.plan.findUnique({ where: { id } });
      if (!plan) throw AppError.notFound('Plan');
      const settings = await this.billing.settings();
      if (
        (await this.db.organization.count({ where: { planId: id } })) ||
        plan.isDefault ||
        settings.defaultPlanId === id
      ) {
        throw AppError.conflict(
          'Organisations use this plan. Switch it off instead.',
          'PLAN_IN_USE',
        );
      }
      await this.db.$transaction(async (tx) => {
        await tx.plan.delete({ where: { id } });
        await this.audit.record(
          { action: 'plan.delete', entity: 'plan', entityId: id, orgId: null, before: plan },
          tx,
        );
      });
    });
  }

  // ── Organisations ──

  private async toOrg(o: Organization, plans: Map<string, Plan>) {
    const plan = o.planId ? (plans.get(o.planId) ?? null) : null;
    const today = parseDateOnly(todayInNairobi());
    const [owner, balance, occupiedUnits] = await Promise.all([
      this.db.membership.findFirst({
        where: { orgId: o.id, role: { systemKey: 'OWNER' } },
        orderBy: { createdAt: 'asc' },
        select: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      }),
      this.billing.balance(o.id),
      this.billing.occupiedUnits(this.db, o.id, today),
    ]);
    return {
      id: o.id,
      name: o.name,
      kind: o.kind,
      phone: o.phone,
      email: o.email,
      status: o.status,
      billingRef: o.billingRef,
      plan: plan ? { id: plan.id, name: plan.name } : null,
      price: this.billing.price(o, plan),
      priceOverride: o.priceOverride,
      minimumOverride: o.minimumOverride,
      trialEndsAt: formatDateOnlyOrNull(o.trialEndsAt),
      noSuspendUntil: formatDateOnlyOrNull(o.noSuspendUntil),
      balance: balance.balance,
      overdue: balance.overdue,
      credit: o.platformCredit,
      occupiedUnits,
      owner: owner?.user ?? null,
      createdAt: o.createdAt,
    };
  }

  private async planMap() {
    return new Map((await this.db.plan.findMany()).map((p) => [p.id, p]));
  }

  organizations(q: ListOrgsQueryDto) {
    return withoutOrgScope(async () => {
      const term = q.q?.trim();
      const where: Prisma.OrganizationWhereInput = {
        ...(q.status ? { status: q.status } : {}),
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { billingRef: { contains: term.toUpperCase() } },
              ],
            }
          : {}),
      };
      const [rows, total, plans] = await Promise.all([
        this.db.organization.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(q) }),
        this.db.organization.count({ where }),
        this.planMap(),
      ]);
      return paginated(await Promise.all(rows.map((o) => this.toOrg(o, plans))), total, q);
    });
  }

  organization(id: string) {
    return withoutOrgScope(async () => {
      const o = await this.db.organization.findUnique({ where: { id } });
      if (!o) throw AppError.notFound('Organisation');
      return this.toOrg(o, await this.planMap());
    });
  }

  updateOrganization(id: string, dto: UpdateOrgBillingDto) {
    return withoutOrgScope(async () => {
      const before = await this.db.organization.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('Organisation');
      if (dto.planId) {
        const plan = await this.db.plan.findUnique({ where: { id: dto.planId } });
        if (!plan?.active) throw AppError.fieldInvalid('planId', 'Choose an active plan');
      }
      const date = (v: string | null) => (v === null ? null : parseDateOnly(v));
      const data: Prisma.OrganizationUpdateInput = {
        ...(dto.planId !== undefined ? { planId: dto.planId } : {}),
        ...(dto.priceOverride !== undefined
          ? { priceOverride: dto.priceOverride === null ? null : BigInt(dto.priceOverride) }
          : {}),
        ...(dto.minimumOverride !== undefined
          ? { minimumOverride: dto.minimumOverride === null ? null : BigInt(dto.minimumOverride) }
          : {}),
        ...(dto.trialEndsAt !== undefined ? { trialEndsAt: date(dto.trialEndsAt) } : {}),
        ...(dto.noSuspendUntil !== undefined ? { noSuspendUntil: date(dto.noSuspendUntil) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      };
      const terms = (o: Organization) => ({
        planId: o.planId,
        priceOverride: o.priceOverride,
        minimumOverride: o.minimumOverride,
        trialEndsAt: formatDateOnlyOrNull(o.trialEndsAt),
        noSuspendUntil: formatDateOnlyOrNull(o.noSuspendUntil),
        status: o.status,
      });
      await this.db.$transaction(async (tx) => {
        const after = await tx.organization.update({ where: { id }, data });
        await this.audit.record(
          {
            action: 'organization.billing_update',
            entity: 'organization',
            entityId: id,
            orgId: id,
            before: terms(before),
            after: terms(after),
          },
          tx,
        );
      });
      // Reopening, a new trial end or a no-suspension date can change the status at once.
      if (dto.status !== 'CLOSED') await this.billing.refreshStatus(id);
      return this.organization(id);
    });
  }
}
