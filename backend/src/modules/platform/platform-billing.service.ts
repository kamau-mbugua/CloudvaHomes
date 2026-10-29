import { Inject, Injectable, Logger } from '@nestjs/common';
import { currentContext, withoutOrgScope } from '../../common/context/request-context.js';
import {
  formatDateOnly,
  formatDateOnlyOrNull,
  parseDateOnly,
} from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type {
  Organization,
  Plan,
  PlatformInvoice,
  PlatformPayment,
  Prisma,
} from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { addDays, invoiceStatus, todayInNairobi } from '../billing/billing-math.js';
import { monthBounds } from '../reports/report-math.js';
import { platformTotal, previousPeriod, statusFor, type OrgStatus } from './platform-math.js';
import type { ListPlatformInvoicesDto, ListPlatformPaymentsDto } from './platform.dto.js';

/**
 * Hodi billing organisations (design §5.4). Platform data spans organisations, so this uses
 * the unscoped client and filters by orgId explicitly everywhere.
 */
@Injectable()
export class PlatformBillingService {
  private readonly log = new Logger(PlatformBillingService.name);

  constructor(
    @Inject(DB) private readonly prisma: Db,
    private readonly audit: AuditService,
  ) {}

  settings() {
    return this.prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  /** The price an organisation pays: its override, else its plan. */
  price(org: Pick<Organization, 'priceOverride' | 'minimumOverride'>, plan: Plan | null) {
    return {
      pricePerUnit: org.priceOverride ?? plan?.pricePerUnit ?? 0n,
      minimumMonthly: org.minimumOverride ?? plan?.minimumMonthly ?? 0n,
      custom: org.priceOverride !== null || org.minimumOverride !== null,
    };
  }

  /** Units with a tenancy covering `date` (raw SQL: filter by orgId explicitly). */
  async occupiedUnits(client: Tx | Db, orgId: string, date: Date): Promise<number> {
    const rows = await client.$queryRaw<{ n: number }[]>`
      SELECT count(DISTINCT "unitId")::int AS n FROM "tenancies"
       WHERE "orgId" = ${orgId}::uuid AND "startDate" <= ${date}
         AND ("endDate" IS NULL OR "endDate" >= ${date})`;
    return rows[0]?.n ?? 0;
  }

  // ── Monthly run ──

  /** Bills `period` for every open organisation (or one). Idempotent. */
  run(period: string, onlyOrgId?: string) {
    return withoutOrgScope(() => this.runUnscoped(period, onlyOrgId));
  }

  private async runUnscoped(period: string, onlyOrgId?: string) {
    const { end } = monthBounds(period);
    if (formatDateOnly(end) >= todayInNairobi()) {
      throw AppError.fieldInvalid('period', 'Only a month that has ended can be billed');
    }
    const orgs = await this.prisma.organization.findMany({
      where: { status: { not: 'CLOSED' }, ...(onlyOrgId ? { id: onlyOrgId } : {}) },
      select: { id: true },
    });
    let created = 0;
    for (const o of orgs) {
      try {
        if (await this.billOrg(o.id, period)) created++;
      } catch (e) {
        if (violatesUnique(e, 'platform_invoices_one_live_per_period')) continue;
        this.log.error({ err: e, orgId: o.id }, 'Platform invoice failed');
      }
    }
    return { period, created };
  }

  private async billOrg(orgId: string, period: string): Promise<boolean> {
    const { end } = monthBounds(period);
    const settings = await this.settings();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "organizations" WHERE "id" = ${orgId}::uuid FOR UPDATE`;
      const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      if (org.trialEndsAt && org.trialEndsAt >= end) return false; // the whole month was trial
      if (await tx.platformInvoice.count({ where: { orgId, period, status: { not: 'VOID' } } }))
        return false;
      const plan = org.planId ? await tx.plan.findUnique({ where: { id: org.planId } }) : null;
      const price = this.price(org, plan);
      const units = await this.occupiedUnits(tx, orgId, end);
      const total = platformTotal(units, price.pricePerUnit, price.minimumMonthly);
      if (total === 0n) return false;
      const today = parseDateOnly(todayInNairobi());
      const [{ n }] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT nextval('"platform_invoice_seq"') AS n`;
      const inv = await tx.platformInvoice.create({
        data: {
          orgId,
          number: `HODI-${todayInNairobi().slice(0, 4)}-${String(n).padStart(6, '0')}`,
          period,
          occupiedUnits: units,
          rate: price.pricePerUnit,
          minimum: price.minimumMonthly,
          total,
          issueDate: today,
          dueDate: addDays(today, settings.dueDays),
        },
      });
      await this.audit.record(
        {
          action: 'platform_invoice.issue',
          entity: 'platform_invoice',
          entityId: inv.id,
          orgId,
          actorId: currentContext()?.userId ?? null,
          after: { number: inv.number, period, units, total },
        },
        tx,
      );
      await this.applyCredit(tx, orgId);
      return true;
    });
  }

  voidInvoice(id: string, reason: string) {
    return withoutOrgScope(() => this.voidUnscoped(id, reason));
  }

  private async voidUnscoped(id: string, reason: string) {
    const inv = await this.prisma.platformInvoice.findUnique({ where: { id } });
    if (!inv) throw AppError.notFound('Invoice');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.platformInvoice.updateMany({
        where: { id, status: { not: 'VOID' }, amountPaid: 0n },
        data: { status: 'VOID', voidReason: reason.trim() },
      });
      if (!count)
        throw AppError.conflict('Only an unpaid invoice can be voided', 'INVOICE_SETTLED');
      await this.audit.record(
        {
          action: 'platform_invoice.void',
          entity: 'platform_invoice',
          entityId: id,
          orgId: inv.orgId,
          after: { reason },
        },
        tx,
      );
    });
    await this.refreshStatus(inv.orgId);
    return this.invoice(id);
  }

  // ── Payments ──

  /** Records money from an organisation, pays its oldest invoices first, keeps the rest as credit. */
  recordPayment(p: Parameters<PlatformBillingService['recordUnscoped']>[0]) {
    return withoutOrgScope(() => this.recordUnscoped(p));
  }

  private async recordUnscoped(p: {
    orgId: string;
    amount: bigint;
    method: 'MPESA' | 'BANK' | 'CHEQUE' | 'OTHER';
    source: 'STK' | 'C2B' | 'MANUAL';
    reference: string;
    receivedAt: Date;
    payerName?: string | null;
    note?: string | null;
    raw?: Prisma.InputJsonValue;
  }) {
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "organizations" WHERE "id" = ${p.orgId}::uuid FOR UPDATE`;
        const pay = await tx.platformPayment.create({
          data: {
            orgId: p.orgId,
            amount: p.amount,
            unallocated: p.amount,
            method: p.method,
            source: p.source,
            reference: p.reference.trim().toUpperCase(),
            payerName: p.payerName ?? null,
            note: p.note ?? null,
            receivedAt: p.receivedAt,
            recordedById: currentContext()?.userId ?? null,
            raw: p.raw,
          },
        });
        await this.applyCredit(tx, p.orgId);
        await this.audit.record(
          {
            action: 'platform_payment.record',
            entity: 'platform_payment',
            entityId: pay.id,
            orgId: p.orgId,
            actorId: currentContext()?.userId ?? null,
            after: { amount: p.amount, reference: pay.reference, source: p.source },
          },
          tx,
        );
        return pay.id;
      });
    } catch (e) {
      if (violatesUnique(e, 'reference')) {
        throw AppError.conflict('This reference was already recorded', 'DUPLICATE_REFERENCE');
      }
      throw e;
    }
    await this.refreshStatus(p.orgId);
    return id;
  }

  /** Spends unallocated payments (oldest first) on open invoices (oldest due first). */
  private async applyCredit(tx: Tx, orgId: string) {
    const payments = await tx.platformPayment.findMany({
      where: { orgId, unallocated: { gt: 0n } },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const invoices = await tx.platformInvoice.findMany({
      where: { orgId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
    });
    for (const pay of payments) {
      let left = pay.unallocated;
      for (const inv of invoices) {
        const balance = inv.total - inv.amountPaid;
        if (left <= 0n || balance <= 0n) continue;
        const take = balance < left ? balance : left;
        inv.amountPaid += take;
        left -= take;
        await tx.platformAllocation.create({
          data: { paymentId: pay.id, invoiceId: inv.id, amount: take },
        });
        await tx.platformInvoice.update({
          where: { id: inv.id },
          data: {
            amountPaid: inv.amountPaid,
            status: invoiceStatus(inv.total, inv.amountPaid, 0n),
          },
        });
      }
      if (left !== pay.unallocated)
        await tx.platformPayment.update({ where: { id: pay.id }, data: { unallocated: left } });
    }
    const credit = await tx.platformPayment.aggregate({
      where: { orgId },
      _sum: { unallocated: true },
    });
    await tx.organization.update({
      where: { id: orgId },
      data: { platformCredit: credit._sum.unallocated ?? 0n },
    });
  }

  // ── Status ──

  refreshStatus(orgId: string, today = todayInNairobi()): Promise<OrgStatus> {
    return withoutOrgScope(() => this.refreshUnscoped(orgId, today));
  }

  private async refreshUnscoped(orgId: string, today: string): Promise<OrgStatus> {
    const [org, settings, oldest] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
      this.settings(),
      this.prisma.platformInvoice.findFirst({
        where: {
          orgId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
          dueDate: { lt: parseDateOnly(today) },
        },
        orderBy: { dueDate: 'asc' },
        select: { dueDate: true },
      }),
    ]);
    const next = statusFor({
      current: org.status,
      today,
      trialEndsAt: formatDateOnlyOrNull(org.trialEndsAt),
      noSuspendUntil: formatDateOnlyOrNull(org.noSuspendUntil),
      oldestOverdueDue: oldest ? formatDateOnly(oldest.dueDate) : null,
      suspendAfterDays: settings.suspendAfterDays,
    });
    if (next !== org.status) {
      await this.prisma.organization.update({ where: { id: orgId }, data: { status: next } });
      await this.audit.record({
        action: 'organization.status',
        entity: 'organization',
        entityId: orgId,
        orgId,
        actorId: null,
        before: { status: org.status },
        after: { status: next },
      });
    }
    return next;
  }

  async refreshAll(today = todayInNairobi()) {
    const orgs = await this.prisma.organization.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true },
    });
    const changed: Record<string, number> = {};
    for (const o of orgs) {
      try {
        const s = await this.refreshStatus(o.id, today);
        changed[s] = (changed[s] ?? 0) + 1;
      } catch (e) {
        this.log.error({ err: e, orgId: o.id }, 'Status refresh failed');
      }
    }
    return changed;
  }

  /** Scheduled on the 1st: bill last month. */
  runDue(today = todayInNairobi()) {
    return this.run(previousPeriod(today));
  }

  // ── Reading ──

  toInvoice(i: PlatformInvoice, today = todayInNairobi()) {
    const balance = i.status === 'VOID' ? 0n : i.total - i.amountPaid;
    return {
      id: i.id,
      orgId: i.orgId,
      number: i.number,
      period: i.period,
      occupiedUnits: i.occupiedUnits,
      rate: i.rate,
      minimum: i.minimum,
      total: i.total,
      amountPaid: i.amountPaid,
      balance,
      issueDate: formatDateOnly(i.issueDate),
      dueDate: formatDateOnly(i.dueDate),
      status: i.status,
      overdue: balance > 0n && formatDateOnly(i.dueDate) < today,
      voidReason: i.voidReason,
      createdAt: i.createdAt,
    };
  }

  private salespersonOrgFilter(): { onboardedById: string } | null {
    const ctx = currentContext();
    if (ctx?.platformRole === 'SALESPERSON' && ctx.userId) {
      return { onboardedById: ctx.userId };
    }
    return null;
  }

  async invoices(q: ListPlatformInvoicesDto) {
    const sp = this.salespersonOrgFilter();
    let allowedOrgIds: string[] | null = null;
    if (sp) {
      const myOrgs = await this.prisma.organization.findMany({
        where: { onboardedById: sp.onboardedById, ...(q.orgId ? { id: q.orgId } : {}) },
        select: { id: true },
      });
      allowedOrgIds = myOrgs.map((o) => o.id);
    }
    const today = todayInNairobi();
    const statusFilter: Prisma.PlatformInvoiceWhereInput =
      q.status === 'OVERDUE'
        ? {
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            dueDate: { lt: parseDateOnly(today) },
          }
        : q.status
          ? { status: q.status }
          : {};
    const where: Prisma.PlatformInvoiceWhereInput = {
      ...(allowedOrgIds !== null
        ? { orgId: { in: allowedOrgIds } }
        : q.orgId
          ? { orgId: q.orgId }
          : {}),
      ...statusFilter,
      ...(q.period ? { period: q.period } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.platformInvoice.findMany({
        where,
        orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
        ...toSkipTake(q),
      }),
      this.prisma.platformInvoice.count({ where }),
    ]);
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.orgId))] } },
      select: { id: true, name: true, billingRef: true },
    });
    const byId = new Map(orgs.map((o) => [o.id, o]));
    return paginated(
      rows.map((r) => ({ ...this.toInvoice(r, today), organization: byId.get(r.orgId) ?? null })),
      total,
      q,
    );
  }

  async invoice(id: string, orgId?: string) {
    const sp = this.salespersonOrgFilter();
    const i = await this.prisma.platformInvoice.findFirst({
      where: { id, ...(orgId ? { orgId } : {}) },
      include: { allocations: { include: { payment: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!i) throw AppError.notFound('Invoice');
    if (sp) {
      const org = await this.prisma.organization.findFirst({
        where: { id: i.orgId, onboardedById: sp.onboardedById },
        select: { id: true },
      });
      if (!org) throw AppError.notFound('Invoice');
    }
    return {
      ...this.toInvoice(i),
      payments: i.allocations.map((a) => ({
        id: a.payment.id,
        reference: a.payment.reference,
        method: a.payment.method,
        receivedAt: formatDateOnly(a.payment.receivedAt),
        amount: a.amount,
      })),
    };
  }

  async payments(q: ListPlatformPaymentsDto) {
    const sp = this.salespersonOrgFilter();
    let allowedOrgIds: string[] | null = null;
    if (sp) {
      const myOrgs = await this.prisma.organization.findMany({
        where: { onboardedById: sp.onboardedById, ...(q.orgId ? { id: q.orgId } : {}) },
        select: { id: true },
      });
      allowedOrgIds = myOrgs.map((o) => o.id);
    }
    const where: Prisma.PlatformPaymentWhereInput =
      allowedOrgIds !== null
        ? { orgId: { in: allowedOrgIds } }
        : q.orgId
          ? { orgId: q.orgId }
          : {};
    const [rows, total] = await Promise.all([
      this.prisma.platformPayment.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.prisma.platformPayment.count({ where }),
    ]);
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.orgId))] } },
      select: { id: true, name: true, billingRef: true },
    });
    const byId = new Map(orgs.map((o) => [o.id, o]));
    return paginated(
      rows.map((p) => ({ ...this.toPayment(p), organization: byId.get(p.orgId) ?? null })),
      total,
      q,
    );
  }

  toPayment(p: PlatformPayment) {
    return {
      id: p.id,
      orgId: p.orgId,
      amount: p.amount,
      unallocated: p.unallocated,
      method: p.method,
      source: p.source,
      reference: p.reference,
      payerName: p.payerName,
      note: p.note,
      receivedAt: formatDateOnly(p.receivedAt),
      createdAt: p.createdAt,
    };
  }

  async payment(id: string) {
    const p = await this.prisma.platformPayment.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Payment');
    return this.toPayment(p);
  }

  /** What an organisation owes Hodi now. */
  async balance(orgId: string) {
    const today = todayInNairobi();
    const open = await this.prisma.platformInvoice.findMany({
      where: { orgId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      orderBy: { dueDate: 'asc' },
    });
    const balance = open.reduce((s, i) => s + i.total - i.amountPaid, 0n);
    const overdue = open.filter((i) => formatDateOnly(i.dueDate) < today);
    return {
      balance,
      overdue: overdue.length
        ? {
            amount: overdue.reduce((s, i) => s + i.total - i.amountPaid, 0n),
            since: formatDateOnly(overdue[0]!.dueDate),
          }
        : null,
    };
  }

  async stats() {
    const today = todayInNairobi();
    const lastMonth = previousPeriod(today);
    const sp = this.salespersonOrgFilter();
    const orgFilter: Prisma.OrganizationWhereInput = sp ? { onboardedById: sp.onboardedById } : {};
    let orgIdsFilter: { orgId: { in: string[] } } | Record<string, never> = {};
    if (sp) {
      const myOrgs = await this.prisma.organization.findMany({
        where: orgFilter,
        select: { id: true },
      });
      orgIdsFilter = { orgId: { in: myOrgs.map((o) => o.id) } };
    }
    const [byStatus, billed, outstanding, collected, orgs] = await Promise.all([
      this.prisma.organization.groupBy({ where: orgFilter, by: ['status'], _count: { _all: true } }),
      this.prisma.platformInvoice.aggregate({
        where: { ...orgIdsFilter, period: lastMonth, status: { not: 'VOID' } },
        _sum: { total: true },
      }),
      this.prisma.platformInvoice.findMany({
        where: { ...orgIdsFilter, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        select: { total: true, amountPaid: true },
      }),
      this.prisma.platformPayment.aggregate({
        where: {
          ...orgIdsFilter,
          receivedAt: { gte: parseDateOnly(`${today.slice(0, 7)}-01`) },
        },
        _sum: { amount: true },
      }),
      this.prisma.organization.findMany({
        where: { ...orgFilter, status: { not: 'CLOSED' } },
        select: { id: true },
      }),
    ]);
    let units = 0;
    for (const o of orgs)
      units += await this.occupiedUnits(this.prisma, o.id, parseDateOnly(today));
    const counts = Object.fromEntries(
      ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CLOSED'].map((s) => [
        s,
        byStatus.find((b) => b.status === s)?._count._all ?? 0,
      ]),
    );
    return {
      organizations: counts,
      occupiedUnits: units,
      lastMonth,
      lastMonthBilled: billed._sum.total ?? 0n,
      outstanding: outstanding.reduce((s, i) => s + i.total - i.amountPaid, 0n),
      collectedThisMonth: collected._sum.amount ?? 0n,
    };
  }
}
