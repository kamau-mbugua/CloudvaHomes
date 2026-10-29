import { Inject, Injectable } from '@nestjs/common';
import { withoutOrgScope } from '../../common/context/request-context.js';
import {
  formatDateOnly,
  formatDateOnlyOrNull,
  parseDateOnly,
} from '../../common/dates/date-only.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Organization, Plan, Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { PlatformBillingService } from './platform-billing.service.js';
import { platformTotal } from './platform-math.js';
import type {
  InvoicesReportQueryDto,
  PlatformAuditQueryDto,
  ReportDateRangeQueryDto,
} from './platform.dto.js';

export interface AgedReceivableRow {
  orgId: string;
  organizationName: string;
  billingRef: string | null;
  status: string;
  salesperson: string | null;
  oldestDueDate: string | null;
  current: bigint;
  days1to30: bigint;
  days31to60: bigint;
  days61to90: bigint;
  daysOver90: bigint;
  total: bigint;
}

function daysBetween(fromDateOnly: string, toDateOnly: string): number {
  const a = parseDateOnly(fromDateOnly).getTime();
  const b = parseDateOnly(toDateOnly).getTime();
  return Math.round((b - a) / 86_400_000);
}

function resolveRange(q: ReportDateRangeQueryDto): {
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
  toEndDateTime: Date;
} {
  const today = todayInNairobi();
  const from = q.from ?? `${today.slice(0, 7)}-01`;
  const to = q.to ?? today;
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  const toEndDateTime = new Date(toDate.getTime() + 86_400_000 - 1);
  return { from, to, fromDate, toDate, toEndDateTime };
}

function fullName(u: { firstName: string; lastName: string } | null | undefined): string | null {
  return u ? `${u.firstName} ${u.lastName}`.trim() : null;
}

@Injectable()
export class PlatformReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly billing: PlatformBillingService,
  ) {}

  /** 1. Collections report: every platform payment received in range. */
  collections(q: ReportDateRangeQueryDto) {
    return withoutOrgScope(async () => {
      const { from, to, fromDate, toDate } = resolveRange(q);
      const payments = await this.db.platformPayment.findMany({
        where: { receivedAt: { gte: fromDate, lte: toDate } },
        include: {
          allocations: {
            include: { invoice: { select: { id: true, number: true, period: true } } },
          },
        },
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      });
      const orgIds = [...new Set(payments.map((p) => p.orgId))];
      const orgs = orgIds.length
        ? await this.db.organization.findMany({
            where: { id: { in: orgIds } },
            include: {
              onboardedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          })
        : [];
      const orgById = new Map(orgs.map((o) => [o.id, o]));
      const actorIds = [
        ...new Set(payments.map((p) => p.recordedById).filter((id): id is string => Boolean(id))),
      ];
      const actors = actorIds.length
        ? await this.db.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
      const actorById = new Map(actors.map((a) => [a.id, a]));

      let totalAmount = 0n;
      const byMethod: Record<string, bigint> = {};
      const rows = payments.map((p) => {
        totalAmount += p.amount;
        byMethod[p.method] = (byMethod[p.method] ?? 0n) + p.amount;
        const org = orgById.get(p.orgId);
        return {
          id: p.id,
          receivedAt: formatDateOnly(p.receivedAt),
          orgId: p.orgId,
          organizationName: org?.name ?? '—',
          billingRef: org?.billingRef ?? null,
          salesperson: fullName(org?.onboardedBy),
          invoiceNumbers: p.allocations.map((a) => a.invoice.number).join(', ') || null,
          amount: p.amount,
          unallocated: p.unallocated,
          method: p.method,
          source: p.source,
          reference: p.reference,
          payerName: p.payerName,
          recordedBy: p.recordedById ? fullName(actorById.get(p.recordedById)) : 'Automatic',
          note: p.note,
        };
      });

      return {
        from,
        to,
        rows,
        totals: {
          count: rows.length,
          amount: totalAmount,
          byMethod,
        },
      };
    });
  }

  /** 2. Aged receivables: open platform invoices grouped by organisation and aging bucket. */
  agedReceivables() {
    return withoutOrgScope(async () => {
      const today = todayInNairobi();
      const invoices = await this.db.platformInvoice.findMany({
        where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        orderBy: [{ dueDate: 'asc' }],
      });
      const orgIds = [...new Set(invoices.map((i) => i.orgId))];
      const orgs = orgIds.length
        ? await this.db.organization.findMany({
            where: { id: { in: orgIds } },
            include: {
              onboardedBy: { select: { firstName: true, lastName: true } },
            },
          })
        : [];
      const orgById = new Map(orgs.map((o) => [o.id, o]));

      const byOrg = new Map<string, AgedReceivableRow>();
      const totals = {
        current: 0n,
        days1to30: 0n,
        days31to60: 0n,
        days61to90: 0n,
        daysOver90: 0n,
        total: 0n,
        organizationsCount: 0,
      };

      for (const inv of invoices) {
        const balance = inv.total - inv.amountPaid;
        if (balance <= 0n) continue;
        const due = formatDateOnly(inv.dueDate);
        const daysLate = daysBetween(due, today);
        const org = orgById.get(inv.orgId);
        let row = byOrg.get(inv.orgId);
        if (!row) {
          row = {
            orgId: inv.orgId,
            organizationName: org?.name ?? '—',
            billingRef: org?.billingRef ?? null,
            status: org?.status ?? 'ACTIVE',
            salesperson: fullName(org?.onboardedBy),
            oldestDueDate: due,
            current: 0n,
            days1to30: 0n,
            days31to60: 0n,
            days61to90: 0n,
            daysOver90: 0n,
            total: 0n,
          };
          byOrg.set(inv.orgId, row);
        }
        if (daysLate <= 0) {
          row.current += balance;
          totals.current += balance;
        } else if (daysLate <= 30) {
          row.days1to30 += balance;
          totals.days1to30 += balance;
        } else if (daysLate <= 60) {
          row.days31to60 += balance;
          totals.days31to60 += balance;
        } else if (daysLate <= 90) {
          row.days61to90 += balance;
          totals.days61to90 += balance;
        } else {
          row.daysOver90 += balance;
          totals.daysOver90 += balance;
        }
        row.total += balance;
        totals.total += balance;
      }

      const rows = [...byOrg.values()].sort((a, b) => (b.total > a.total ? 1 : -1));
      totals.organizationsCount = rows.length;
      return { asOf: today, rows, totals };
    });
  }

  /** 3. Organisation activity & health report. */
  activity() {
    return withoutOrgScope(async () => {
      const todayDate = parseDateOnly(todayInNairobi());
      const [orgs, plans] = await Promise.all([
        this.db.organization.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            onboardedBy: { select: { firstName: true, lastName: true } },
            _count: { select: { properties: true, tenants: true } },
          },
        }),
        this.db.plan.findMany(),
      ]);
      const planMap = new Map(plans.map((p) => [p.id, p]));

      let totalProperties = 0;
      let totalUnits = 0;
      let totalOccupied = 0;
      let totalTenants = 0;

      const rows = await Promise.all(
        orgs.map(async (o) => {
          const [unitsCount, occupiedUnits, lastRentPay, lastPlatformPay, lastMember] =
            await Promise.all([
              this.db.unit.count({ where: { orgId: o.id } }),
              this.billing.occupiedUnits(this.db, o.id, todayDate),
              this.db.payment.findFirst({
                where: { orgId: o.id, amount: { gt: 0n } },
                orderBy: { receivedAt: 'desc' },
                select: { receivedAt: true },
              }),
              this.db.platformPayment.findFirst({
                where: { orgId: o.id },
                orderBy: { receivedAt: 'desc' },
                select: { receivedAt: true },
              }),
              this.db.membership.findFirst({
                where: { orgId: o.id, user: { lastLoginAt: { not: null } } },
                orderBy: { user: { lastLoginAt: 'desc' } },
                select: { user: { select: { lastLoginAt: true } } },
              }),
            ]);
          totalProperties += o._count.properties;
          totalUnits += unitsCount;
          totalOccupied += occupiedUnits;
          totalTenants += o._count.tenants;
          return {
            id: o.id,
            name: o.name,
            kind: o.kind,
            status: o.status,
            billingRef: o.billingRef,
            planName: o.planId ? (planMap.get(o.planId)?.name ?? null) : null,
            salesperson: fullName(o.onboardedBy),
            propertiesCount: o._count.properties,
            unitsCount,
            occupiedUnits,
            tenantsCount: o._count.tenants,
            lastRentPaymentAt: formatDateOnlyOrNull(lastRentPay?.receivedAt ?? null),
            lastPlatformPaymentAt: formatDateOnlyOrNull(lastPlatformPay?.receivedAt ?? null),
            lastStaffLoginAt: lastMember?.user.lastLoginAt ?? null,
            createdAt: o.createdAt,
          };
        }),
      );

      return {
        rows,
        totals: {
          organizations: rows.length,
          activeOrganizations: rows.filter((r) => r.status === 'ACTIVE' || r.status === 'TRIAL')
            .length,
          properties: totalProperties,
          units: totalUnits,
          occupiedUnits: totalOccupied,
          tenants: totalTenants,
        },
      };
    });
  }

  /** 4. Subscription, status & plan changes report. */
  subscriptionChanges(q: ReportDateRangeQueryDto) {
    return withoutOrgScope(async () => {
      const { from, to, fromDate, toEndDateTime } = resolveRange(q);
      const actions = [
        'organization.create',
        'organization.billing_update',
        'organization.status',
        'platform_invoice.void',
      ];
      const logs = await this.db.auditLog.findMany({
        where: {
          action: { in: actions },
          createdAt: { gte: fromDate, lte: toEndDateTime },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const orgIds = [
        ...new Set(logs.map((l) => l.orgId).filter((id): id is string => Boolean(id))),
      ];
      const actorIds = [
        ...new Set(logs.map((l) => l.actorId).filter((id): id is string => Boolean(id))),
      ];
      const [orgs, actors, plans] = await Promise.all([
        orgIds.length
          ? this.db.organization.findMany({
              where: { id: { in: orgIds } },
              select: { id: true, name: true, billingRef: true },
            })
          : [],
        actorIds.length
          ? this.db.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, firstName: true, lastName: true, email: true },
            })
          : [],
        this.db.plan.findMany({ select: { id: true, name: true } }),
      ]);
      const orgById = new Map(orgs.map((o) => [o.id, o]));
      const actorById = new Map(actors.map((a) => [a.id, a]));
      const planById = new Map(plans.map((p) => [p.id, p.name]));

      const rows = logs.map((l) => {
        const org = l.orgId ? orgById.get(l.orgId) : null;
        const actor = l.actorId ? actorById.get(l.actorId) : null;
        const beforeObj = (l.before ?? {}) as Record<string, unknown>;
        const afterObj = (l.after ?? {}) as Record<string, unknown>;
        return {
          id: l.id,
          createdAt: l.createdAt,
          action: l.action,
          orgId: l.orgId,
          organizationName: org?.name ?? (afterObj.name as string | undefined) ?? '—',
          billingRef: org?.billingRef ?? null,
          actorName: actor ? fullName(actor) : 'System',
          actorEmail: actor?.email ?? null,
          beforeStatus: (beforeObj.status as string | undefined) ?? null,
          afterStatus: (afterObj.status as string | undefined) ?? null,
          beforePlan:
            typeof beforeObj.planId === 'string'
              ? (planById.get(beforeObj.planId) ?? null)
              : null,
          afterPlan:
            typeof afterObj.planId === 'string'
              ? (planById.get(afterObj.planId) ?? null)
              : null,
          before: l.before,
          after: l.after,
        };
      });

      return {
        from,
        to,
        rows,
        totals: {
          count: rows.length,
          creations: rows.filter((r) => r.action === 'organization.create').length,
          statusChanges: rows.filter((r) => r.action === 'organization.status').length,
          billingUpdates: rows.filter((r) => r.action === 'organization.billing_update').length,
        },
      };
    });
  }

  /** 5. Onboarding funnel report. */
  onboarding(q: ReportDateRangeQueryDto) {
    return withoutOrgScope(async () => {
      const { from, to, fromDate, toEndDateTime } = resolveRange(q);
      const orgs = await this.db.organization.findMany({
        where: { createdAt: { gte: fromDate, lte: toEndDateTime } },
        orderBy: { createdAt: 'desc' },
        include: {
          onboardedBy: { select: { firstName: true, lastName: true } },
        },
      });

      const rows = await Promise.all(
        orgs.map(async (o) => {
          const [ownerActive, propertiesCount, unitsCount, tenanciesCount, rentCount, hodiCount] =
            await Promise.all([
              this.db.membership.count({
                where: { orgId: o.id, role: { systemKey: 'OWNER' }, status: 'ACTIVE' },
              }),
              this.db.property.count({ where: { orgId: o.id } }),
              this.db.unit.count({ where: { orgId: o.id } }),
              this.db.tenancy.count({ where: { orgId: o.id } }),
              this.db.payment.count({ where: { orgId: o.id, amount: { gt: 0n } } }),
              this.db.platformPayment.count({ where: { orgId: o.id } }),
            ]);
          const milestones = {
            ownerAccepted: ownerActive > 0,
            addedProperty: propertiesCount > 0,
            addedUnits: unitsCount > 0,
            addedTenants: tenanciesCount > 0,
            collectedRent: rentCount > 0,
            paidHodi: hodiCount > 0,
          };
          const completedSteps = Object.values(milestones).filter(Boolean).length;
          return {
            id: o.id,
            name: o.name,
            kind: o.kind,
            status: o.status,
            billingRef: o.billingRef,
            salesperson: fullName(o.onboardedBy),
            createdAt: o.createdAt,
            ...milestones,
            completedSteps,
            totalSteps: 6,
          };
        }),
      );

      return {
        from,
        to,
        rows,
        totals: {
          created: rows.length,
          ownerAccepted: rows.filter((r) => r.ownerAccepted).length,
          addedProperty: rows.filter((r) => r.addedProperty).length,
          addedUnits: rows.filter((r) => r.addedUnits).length,
          addedTenants: rows.filter((r) => r.addedTenants).length,
          collectedRent: rows.filter((r) => r.collectedRent).length,
          paidHodi: rows.filter((r) => r.paidHodi).length,
        },
      };
    });
  }

  /** 6. Invoices report. */
  invoicesReport(q: InvoicesReportQueryDto) {
    return withoutOrgScope(async () => {
      const { from, to, fromDate, toDate } = resolveRange(q);
      const today = todayInNairobi();
      const statusFilter: Prisma.PlatformInvoiceWhereInput =
        q.status === 'OVERDUE'
          ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: parseDateOnly(today) } }
          : q.status
            ? { status: q.status }
            : {};
      const invoices = await this.db.platformInvoice.findMany({
        where: {
          issueDate: { gte: fromDate, lte: toDate },
          ...statusFilter,
        },
        orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      });
      const orgIds = [...new Set(invoices.map((i) => i.orgId))];
      const orgs = orgIds.length
        ? await this.db.organization.findMany({
            where: { id: { in: orgIds } },
            include: { onboardedBy: { select: { firstName: true, lastName: true } } },
          })
        : [];
      const orgById = new Map(orgs.map((o) => [o.id, o]));

      let billed = 0n;
      let paid = 0n;
      let outstanding = 0n;
      let overdue = 0n;

      const rows = invoices.map((inv) => {
        const view = this.billing.toInvoice(inv, today);
        const org = orgById.get(inv.orgId);
        if (inv.status !== 'VOID') {
          billed += inv.total;
          paid += inv.amountPaid;
          outstanding += view.balance;
          if (view.overdue) overdue += view.balance;
        }
        return {
          ...view,
          organizationName: org?.name ?? '—',
          billingRef: org?.billingRef ?? null,
          salesperson: fullName(org?.onboardedBy),
        };
      });

      return {
        from,
        to,
        rows,
        totals: {
          count: rows.length,
          billed,
          paid,
          outstanding,
          overdue,
        },
      };
    });
  }

  /** 7. Plan performance report. */
  planPerformance(q: ReportDateRangeQueryDto) {
    return withoutOrgScope(async () => {
      const { from, to, fromDate, toDate } = resolveRange(q);
      const todayDate = parseDateOnly(todayInNairobi());
      const [plans, orgs, payments, openInvoices] = await Promise.all([
        this.db.plan.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
        this.db.organization.findMany(),
        this.db.platformPayment.findMany({
          where: { receivedAt: { gte: fromDate, lte: toDate } },
          select: { orgId: true, amount: true },
        }),
        this.db.platformInvoice.findMany({
          where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
          select: { orgId: true, total: true, amountPaid: true },
        }),
      ]);

      const collectedByOrg = new Map<string, bigint>();
      for (const p of payments) {
        collectedByOrg.set(p.orgId, (collectedByOrg.get(p.orgId) ?? 0n) + p.amount);
      }
      const outstandingByOrg = new Map<string, bigint>();
      for (const i of openInvoices) {
        outstandingByOrg.set(
          i.orgId,
          (outstandingByOrg.get(i.orgId) ?? 0n) + (i.total - i.amountPaid),
        );
      }
      const unitsByOrg = new Map<string, number>();
      for (const o of orgs) {
        unitsByOrg.set(o.id, await this.billing.occupiedUnits(this.db, o.id, todayDate));
      }

      const buildRow = (plan: Plan | null, planOrgs: Organization[]) => {
        let occupiedUnits = 0;
        let mrr = 0n;
        let collected = 0n;
        let outstanding = 0n;
        for (const o of planOrgs) {
          const u = unitsByOrg.get(o.id) ?? 0;
          occupiedUnits += u;
          if (o.status !== 'CLOSED') {
            const p = this.billing.price(o, plan);
            mrr += platformTotal(u, p.pricePerUnit, p.minimumMonthly);
          }
          collected += collectedByOrg.get(o.id) ?? 0n;
          outstanding += outstandingByOrg.get(o.id) ?? 0n;
        }
        return {
          planId: plan?.id ?? null,
          planName: plan?.name ?? 'No plan assigned',
          active: plan?.active ?? false,
          pricePerUnit: plan?.pricePerUnit ?? 0n,
          minimumMonthly: plan?.minimumMonthly ?? 0n,
          organizationsTotal: planOrgs.length,
          organizationsActive: planOrgs.filter((o) => o.status === 'ACTIVE').length,
          organizationsTrial: planOrgs.filter((o) => o.status === 'TRIAL').length,
          organizationsSuspended: planOrgs.filter((o) => o.status === 'SUSPENDED').length,
          occupiedUnits,
          mrr,
          collected,
          outstanding,
        };
      };

      const rows = plans.map((p) =>
        buildRow(
          p,
          orgs.filter((o) => o.planId === p.id),
        ),
      );
      const unassignedOrgs = orgs.filter((o) => !o.planId);
      if (unassignedOrgs.length > 0) {
        rows.push(buildRow(null, unassignedOrgs));
      }

      const totals = rows.reduce(
        (acc, r) => ({
          organizationsTotal: acc.organizationsTotal + r.organizationsTotal,
          organizationsActive: acc.organizationsActive + r.organizationsActive,
          occupiedUnits: acc.occupiedUnits + r.occupiedUnits,
          mrr: acc.mrr + r.mrr,
          collected: acc.collected + r.collected,
          outstanding: acc.outstanding + r.outstanding,
        }),
        {
          organizationsTotal: 0,
          organizationsActive: 0,
          occupiedUnits: 0,
          mrr: 0n,
          collected: 0n,
          outstanding: 0n,
        },
      );

      return { from, to, rows, totals };
    });
  }

  /** 8. Reconciliation report: unallocated platform credits & STK push attempts. */
  reconciliation() {
    return withoutOrgScope(async () => {
      const [unallocated, stkRequests] = await Promise.all([
        this.db.platformPayment.findMany({
          where: { unallocated: { gt: 0n } },
          orderBy: { receivedAt: 'desc' },
        }),
        this.db.platformStkRequest.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ]);
      const orgIds = [
        ...new Set([...unallocated.map((u) => u.orgId), ...stkRequests.map((s) => s.orgId)]),
      ];
      const orgs = orgIds.length
        ? await this.db.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, billingRef: true },
          })
        : [];
      const orgById = new Map(orgs.map((o) => [o.id, o]));

      const unallocatedRows = unallocated.map((p) => {
        const org = orgById.get(p.orgId);
        return {
          ...this.billing.toPayment(p),
          organizationName: org?.name ?? '—',
          billingRef: org?.billingRef ?? null,
        };
      });

      const stkRows = stkRequests.map((s) => {
        const org = orgById.get(s.orgId);
        return {
          id: s.id,
          orgId: s.orgId,
          organizationName: org?.name ?? '—',
          billingRef: org?.billingRef ?? null,
          phone: s.phone,
          amount: s.amount,
          state: s.state,
          mpesaReceipt: s.mpesaReceipt,
          resultDesc: s.resultDesc,
          createdAt: s.createdAt,
          completedAt: s.completedAt,
        };
      });

      return {
        unallocatedPayments: unallocatedRows,
        stkRequests: stkRows,
        totals: {
          unallocatedCount: unallocatedRows.length,
          unallocatedAmount: unallocatedRows.reduce((s, r) => s + r.unallocated, 0n),
          stkPendingCount: stkRows.filter((s) => s.state === 'PENDING').length,
          stkFailedCount: stkRows.filter((s) => s.state === 'FAILED').length,
          stkSuccessCount: stkRows.filter((s) => s.state === 'SUCCESS').length,
        },
      };
    });
  }

  /** 9. Price vs plan variance report. */
  priceVariance() {
    return withoutOrgScope(async () => {
      const todayDate = parseDateOnly(todayInNairobi());
      const [orgs, plans] = await Promise.all([
        this.db.organization.findMany({
          where: { status: { not: 'CLOSED' } },
          orderBy: { name: 'asc' },
          include: { onboardedBy: { select: { firstName: true, lastName: true } } },
        }),
        this.db.plan.findMany(),
      ]);
      const planMap = new Map(plans.map((p) => [p.id, p]));

      let standardMrr = 0n;
      let effectiveMrr = 0n;
      let customizedCount = 0;

      const rows = await Promise.all(
        orgs.map(async (o) => {
          const plan = o.planId ? (planMap.get(o.planId) ?? null) : null;
          const occupiedUnits = await this.billing.occupiedUnits(this.db, o.id, todayDate);
          const planRate = plan?.pricePerUnit ?? 0n;
          const planMinimum = plan?.minimumMonthly ?? 0n;
          const effective = this.billing.price(o, plan);
          const standardMonthly = platformTotal(occupiedUnits, planRate, planMinimum);
          const effectiveMonthly = platformTotal(
            occupiedUnits,
            effective.pricePerUnit,
            effective.minimumMonthly,
          );
          const varianceMonthly = effectiveMonthly - standardMonthly;
          if (effective.custom) customizedCount++;
          standardMrr += standardMonthly;
          effectiveMrr += effectiveMonthly;
          return {
            orgId: o.id,
            organizationName: o.name,
            billingRef: o.billingRef,
            status: o.status,
            salesperson: fullName(o.onboardedBy),
            planName: plan?.name ?? 'No plan',
            occupiedUnits,
            custom: effective.custom,
            planRate,
            effectiveRate: effective.pricePerUnit,
            planMinimum,
            effectiveMinimum: effective.minimumMonthly,
            standardMonthly,
            effectiveMonthly,
            varianceMonthly,
          };
        }),
      );

      return {
        rows,
        totals: {
          organizationsCount: rows.length,
          customizedCount,
          standardMrr,
          effectiveMrr,
          netVarianceMrr: effectiveMrr - standardMrr,
        },
      };
    });
  }

  /** 10. Salesperson performance report. */
  salespeople(q: ReportDateRangeQueryDto) {
    return withoutOrgScope(async () => {
      const { from, to, fromDate, toDate, toEndDateTime } = resolveRange(q);
      const today = todayInNairobi();
      const todayDate = parseDateOnly(today);

      const [operators, orgs, plans, payments, openInvoices] = await Promise.all([
        this.db.user.findMany({
          where: { OR: [{ isPlatformAdmin: true }, { platformRole: { not: null } }] },
          orderBy: { firstName: 'asc' },
        }),
        this.db.organization.findMany(),
        this.db.plan.findMany(),
        this.db.platformPayment.findMany({
          where: { receivedAt: { gte: fromDate, lte: toDate } },
          select: { orgId: true, amount: true },
        }),
        this.db.platformInvoice.findMany({
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            dueDate: { lt: todayDate },
          },
          select: { orgId: true, total: true, amountPaid: true },
        }),
      ]);

      const planMap = new Map(plans.map((p) => [p.id, p]));
      const collectedByOrg = new Map<string, bigint>();
      for (const p of payments) {
        collectedByOrg.set(p.orgId, (collectedByOrg.get(p.orgId) ?? 0n) + p.amount);
      }
      const overdueByOrg = new Map<string, bigint>();
      for (const i of openInvoices) {
        overdueByOrg.set(i.orgId, (overdueByOrg.get(i.orgId) ?? 0n) + (i.total - i.amountPaid));
      }
      const unitsByOrg = new Map<string, number>();
      for (const o of orgs) {
        unitsByOrg.set(o.id, await this.billing.occupiedUnits(this.db, o.id, todayDate));
      }

      const summarizeBook = (bookOrgs: Organization[]) => {
        let occupiedUnits = 0;
        let mrr = 0n;
        let collected = 0n;
        let overdue = 0n;
        let onboardedInRange = 0;
        for (const o of bookOrgs) {
          const u = unitsByOrg.get(o.id) ?? 0;
          occupiedUnits += u;
          if (o.status !== 'CLOSED') {
            const plan = o.planId ? (planMap.get(o.planId) ?? null) : null;
            const price = this.billing.price(o, plan);
            mrr += platformTotal(u, price.pricePerUnit, price.minimumMonthly);
          }
          collected += collectedByOrg.get(o.id) ?? 0n;
          overdue += overdueByOrg.get(o.id) ?? 0n;
          if (o.createdAt >= fromDate && o.createdAt <= toEndDateTime) {
            onboardedInRange++;
          }
        }
        return {
          organizationsTotal: bookOrgs.length,
          organizationsActive: bookOrgs.filter((o) => o.status === 'ACTIVE' || o.status === 'TRIAL')
            .length,
          onboardedInRange,
          occupiedUnits,
          mrr,
          collected,
          overdue,
          suspendedCount: bookOrgs.filter(
            (o) => o.status === 'SUSPENDED' || o.status === 'CLOSED',
          ).length,
        };
      };

      const rows = operators
        .filter(
          (op) =>
            op.platformRole === 'SALESPERSON' ||
            orgs.some((o) => o.onboardedById === op.id),
        )
        .map((op) => {
          const book = orgs.filter((o) => o.onboardedById === op.id);
          return {
            salespersonId: op.id,
            name: fullName(op) ?? '—',
            email: op.email,
            phone: op.phone,
            role: op.platformRole ?? (op.isPlatformAdmin ? 'SUPERADMIN' : 'SALESPERSON'),
            ...summarizeBook(book),
          };
        });

      const unassigned = summarizeBook(orgs.filter((o) => !o.onboardedById));
      const totals = summarizeBook(orgs);

      return { from, to, rows, unassigned, totals };
    });
  }

  /** 11. Platform Audit Log viewer. */
  auditLogs(q: PlatformAuditQueryDto) {
    return withoutOrgScope(async () => {
      const term = q.q?.trim();
      const where: Prisma.AuditLogWhereInput = {
        ...(q.orgId ? { orgId: q.orgId } : {}),
        ...(q.action ? { action: { contains: q.action.trim(), mode: 'insensitive' } } : {}),
        ...(q.from || q.to
          ? {
              createdAt: {
                ...(q.from ? { gte: parseDateOnly(q.from) } : {}),
                ...(q.to ? { lte: new Date(parseDateOnly(q.to).getTime() + 86_400_000 - 1) } : {}),
              },
            }
          : {}),
        ...(term
          ? {
              OR: [
                { action: { contains: term, mode: 'insensitive' } },
                { entity: { contains: term, mode: 'insensitive' } },
                { entityId: { contains: term, mode: 'insensitive' } },
                { ip: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...toSkipTake(q),
        }),
        this.db.auditLog.count({ where }),
      ]);
      const orgIds = [
        ...new Set(rows.map((r) => r.orgId).filter((id): id is string => Boolean(id))),
      ];
      const actorIds = [
        ...new Set(rows.map((r) => r.actorId).filter((id): id is string => Boolean(id))),
      ];
      const [orgs, actors] = await Promise.all([
        orgIds.length
          ? this.db.organization.findMany({
              where: { id: { in: orgIds } },
              select: { id: true, name: true, billingRef: true },
            })
          : [],
        actorIds.length
          ? this.db.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, firstName: true, lastName: true, email: true },
            })
          : [],
      ]);
      const orgById = new Map(orgs.map((o) => [o.id, o]));
      const actorById = new Map(actors.map((a) => [a.id, a]));

      return paginated(
        rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          orgId: r.orgId,
          organization: r.orgId ? (orgById.get(r.orgId) ?? null) : null,
          actor: r.actorId ? (actorById.get(r.actorId) ?? null) : null,
          ip: r.ip,
          before: r.before,
          after: r.after,
        })),
        total,
        q,
      );
    });
  }
}
