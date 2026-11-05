import type { InspectionKind } from '../../generated/prisma/client.js';
import { InspectionsService } from '../portfolio/inspections/inspections.service.js';
import { Inject, Injectable } from '@nestjs/common';
import {
  currentContext,
  emptyContext,
  runWithContext,
} from '../../common/context/request-context.js';
import {
  formatDateOnly,
  formatDateOnlyOrNull,
  parseDateOnly,
} from '../../common/dates/date-only.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { homeStatus } from './home-status.js';
import { lastMonths, mergeActivity, monthlySeries } from './tenant-insights.js';
import { AppError } from '../../common/errors/app-error.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authContext } from '../auth/decorators.js';
import { InvoicesService } from '../billing/invoices/invoices.service.js';
import { UploadsService } from '../files/uploads.service.js';
import type { CreateTenantMaintenanceRequestDto } from '../maintenance/maintenance.dto.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { StkService } from '../mpesa/stk.service.js';
import { AccountsService } from '../payments/accounts.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { TenanciesService } from '../portfolio/tenancies/tenancies.service.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { TenantAccountsService } from './tenant-accounts.service.js';
import type { TenantInvoicesQueryDto, TenantPayDto } from './tenant-portal.dto.js';
import { toSkipTake, type PaginationQueryDto } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';

/**
 * The tenant portal (design §6.3). A signed-in user linked to a tenant record sees that
 * tenant's account only. Each call runs as the tenant's organisation, and every record read
 * is checked to belong to that tenant (another tenant's id → 404).
 */
@Injectable()
export class TenantPortalService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly tenancies: TenanciesService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly accounts: AccountsService,
    private readonly stk: StkService,
    private readonly tenantAccounts: TenantAccountsService,
    private readonly maintenance: MaintenanceService,
    private readonly uploads: UploadsService,
    private readonly inspectionRecords: InspectionsService,
  ) {}

  async mine() {
    const { userId } = authContext();
    const rows = await this.prisma.tenant.findMany({
      where: { userId, organization: { status: { not: 'CLOSED' } } },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      tenantId: r.id,
      code: r.code,
      name: `${r.firstName} ${r.lastName}`,
      organization: r.organization,
    }));
  }

  /** Runs `fn` as the tenant's organisation; 404 unless the tenant is linked to me. */
  async as<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const { userId, sessionId } = authContext();
    const t = await this.prisma.tenant.findFirst({
      where: { id: tenantId, userId, organization: { status: { not: 'CLOSED' } } },
      select: { orgId: true },
    });
    if (!t) throw AppError.notFound('Account');
    const ctx = currentContext();
    return runWithContext(
      {
        ...emptyContext({ requestId: ctx?.requestId ?? null, ip: ctx?.ip ?? null }),
        userId,
        sessionId,
        orgId: t.orgId,
        permissions: new Set([
          'tenants:view',
          'tenancies:view',
          'invoices:view',
          'payments:view',
          'maintenance:view',
          'maintenance:create',
        ]),
      },
      fn,
    );
  }

  overview(tenantId: string) {
    return this.as(tenantId, async () => {
      const tenant = await this.tenants.get(tenantId);
      const tenancies = await this.db.tenancy.findMany({
        where: { tenantId },
        orderBy: { startDate: 'desc' },
        include: {
          unit: {
            select: {
              id: true,
              number: true,
              property: { select: { id: true, code: true, name: true } },
            },
          },
          rentChanges: {
            where: { appliedAt: null },
            orderBy: { effectivePeriod: 'asc' },
            select: { effectivePeriod: true, newRent: true },
          },
        },
      });
      const current = tenancies.filter((x) => x.status !== 'ENDED');
      const openInvoices = await this.payments.openInvoices(tenantId);
      const today = todayInNairobi();
      const propertyIds = [...new Set(current.map((x) => x.unit.property.id))];
      const channels = await this.tenantAccounts.channelsFor(propertyIds);
      const org = await this.db.organization.findUniqueOrThrow({
        where: { id: currentContext()!.orgId! },
        select: { name: true, phone: true, email: true },
      });
      return {
        tenant: {
          id: tenant.id,
          code: tenant.code,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          phone: tenant.phone,
        },
        organization: org,
        balance: tenant.balance,
        credit: tenant.creditBalance,
        depositHeld: tenancies.reduce((s, x) => s + x.depositHeld, 0n),
        tenancies: (current.length ? current : tenancies.slice(0, 1)).map((x) => ({
          id: x.id,
          unit: { id: x.unit.id, number: x.unit.number },
          property: x.unit.property,
          rentAmount: x.rentAmount,
          depositHeld: x.depositHeld,
          billingDay: x.billingDay,
          status: x.status,
          startDate: formatDateOnly(x.startDate),
          endDate: formatDateOnlyOrNull(x.endDate),
          leaseEndDate: formatDateOnlyOrNull(x.leaseEndDate),
          upcomingRentChanges: x.rentChanges,
          hasSignedLease: Boolean(x.leaseUploadId),
          ...homeStatus(openInvoices, x.id, today),
        })),
        openInvoices,
        howToPay: this.tenantAccounts.howToPay(channels, tenant.code),
        canPayInApp: !!this.tenantAccounts.stkChannel(channels),
      };
    });
  }

  async consolidatedOverview() {
    const accounts = await this.mine();
    const overviews = await Promise.all(accounts.map((a) => this.overview(a.tenantId)));
    let balance = 0n;
    let credit = 0n;
    let depositHeld = 0n;
    for (const o of overviews) {
      balance += BigInt(o.balance);
      credit += BigInt(o.credit);
      depositHeld += BigInt(o.depositHeld);
    }
    const tenancies = overviews.flatMap((o) =>
      o.tenancies.map((t) => ({
        ...t,
        tenantId: o.tenant.id,
        tenantCode: o.tenant.code,
        orgName: o.organization.name,
      })),
    );
    const openInvoices = overviews.flatMap((o) =>
      o.openInvoices.map((i) => ({
        ...i,
        tenantId: o.tenant.id,
        orgName: o.organization.name,
      })),
    );
    return {
      balance,
      credit,
      depositHeld,
      homes: tenancies.filter((t) => t.status === 'ACTIVE' || t.status === 'NOTICE').length,
      tenancies,
      openInvoices,
      accounts: overviews,
    };
  }

  /**
   * My tenant accounts, or — with `tenancyId` — only the account that home belongs to.
   * 404 when the home isn't one of mine. Every query below filters by these tenant ids.
   */
  private async inScope(tenancyId?: string) {
    const accounts = await this.mine();
    if (!tenancyId) return accounts;
    const t = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, tenantId: { in: accounts.map((a) => a.tenantId) } },
      select: { tenantId: true },
    });
    if (!t) throw AppError.notFound('Home');
    return accounts.filter((a) => a.tenantId === t.tenantId);
  }

  /** Billed vs paid per month for my homes (or one), oldest first. */
  async monthly(q: { months: number; tenancyId?: string }) {
    const ids = (await this.inScope(q.tenancyId)).map((a) => a.tenantId);
    const months = lastMonths(todayInNairobi(), q.months);
    const home = q.tenancyId ? { tenancyId: q.tenancyId } : {};
    const [invoices, allocations] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId: { in: ids }, status: { not: 'VOID' }, period: { in: months }, ...home },
        select: { period: true, total: true, creditedAmount: true },
      }),
      this.prisma.paymentAllocation.findMany({
        where: {
          invoice: { tenantId: { in: ids }, ...home },
          payment: { receivedAt: { gte: parseDateOnly(`${months[0]}-01`) } },
        },
        select: { amount: true, payment: { select: { receivedAt: true } } },
      }),
    ]);
    return monthlySeries(
      months,
      invoices.map((i) => ({ period: i.period, amount: i.total - i.creditedAmount })),
      allocations.map((a) => ({
        month: formatDateOnly(a.payment.receivedAt).slice(0, 7),
        amount: a.amount,
      })),
    );
  }

  /** The latest payments, invoices, rent changes and notices across my homes (or one). */
  async activity(q: { limit: number; tenancyId?: string }) {
    const accounts = await this.inScope(q.tenancyId);
    const ids = accounts.map((a) => a.tenantId);
    const orgOf = new Map(accounts.map((a) => [a.tenantId, a.organization.name]));
    const take = q.limit;
    const home = q.tenancyId;
    const [payments, invoices, changes, notices] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          tenantId: { in: ids },
          ...(home ? { allocations: { some: { invoice: { tenancyId: home } } } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          tenantId: true,
          amount: true,
          method: true,
          reference: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId: { in: ids },
          status: { not: 'VOID' },
          ...(home ? { tenancyId: home } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, tenantId: true, number: true, total: true, createdAt: true },
      }),
      this.prisma.rentChange.findMany({
        where: {
          appliedAt: null,
          tenancy: { tenantId: { in: ids }, ...(home ? { id: home } : {}) },
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          effectivePeriod: true,
          newRent: true,
          createdAt: true,
          tenancy: { select: { tenantId: true } },
        },
      }),
      this.prisma.userNotification.findMany({
        where: { userId: authContext().userId, tenantId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take,
        select: { title: true, tenantId: true, createdAt: true },
      }),
    ]);
    type Item = {
      kind: 'PAYMENT' | 'INVOICE' | 'RENT_CHANGE' | 'NOTICE';
      at: string;
      title: string;
      amount: bigint | null;
      orgName: string;
      tenantId: string;
      link: string;
    };
    const org = (tenantId: string) => orgOf.get(tenantId) ?? '';
    return mergeActivity<Item>(
      [
        payments.map((p) => ({
          kind: 'PAYMENT' as const,
          at: p.createdAt.toISOString(),
          title:
            p.amount < 0n
              ? 'Payment reversed'
              : `Payment received${p.reference ? ` · ${p.reference}` : ''}`,
          amount: p.amount,
          orgName: org(p.tenantId),
          tenantId: p.tenantId,
          link: '/tenant/payments',
        })),
        invoices.map((i) => ({
          kind: 'INVOICE' as const,
          at: i.createdAt.toISOString(),
          title: `Invoice ${i.number}`,
          amount: i.total,
          orgName: org(i.tenantId),
          tenantId: i.tenantId,
          link: `/tenant/invoices/${i.id}`,
        })),
        changes.map((c) => ({
          kind: 'RENT_CHANGE' as const,
          at: c.createdAt.toISOString(),
          title: `Rent change from ${c.effectivePeriod}`,
          amount: c.newRent,
          orgName: org(c.tenancy.tenantId),
          tenantId: c.tenancy.tenantId,
          link: '/tenant',
        })),
        notices.map((n) => ({
          kind: 'NOTICE' as const,
          at: n.createdAt.toISOString(),
          title: n.title,
          amount: null,
          orgName: org(n.tenantId!),
          tenantId: n.tenantId!,
          link: '/tenant/notices',
        })),
      ],
      q.limit,
    );
  }

  /**
   * The tenant's notices: their notifications that belong to one of their tenant accounts
   * (`tenantId` set). Staff alerts for a person who is also staff somewhere never show here.
   */
  async notices(q: { page: number; pageSize: number; tenantId?: string }) {
    const accounts = await this.mine();
    const ids = accounts.map((a) => a.tenantId);
    if (q.tenantId && !ids.includes(q.tenantId)) throw AppError.notFound('Account');
    const where = {
      userId: authContext().userId,
      tenantId: { in: q.tenantId ? [q.tenantId] : ids },
    };
    const [rows, total] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q),
      }),
      this.prisma.userNotification.count({ where }),
    ]);
    const orgOf = new Map(accounts.map((a) => [a.tenantId, a.organization.name]));
    return paginated(
      rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        actionUrl: n.actionUrl,
        readAt: n.readAt,
        createdAt: n.createdAt,
        tenantId: n.tenantId!,
        orgName: orgOf.get(n.tenantId!) ?? null,
      })),
      total,
      q,
    );
  }

  invoicesList(tenantId: string, q: TenantInvoicesQueryDto) {
    return this.as(tenantId, () =>
      this.invoices.list({
        page: q.page,
        pageSize: q.pageSize,
        status: q.status,
        tenantId,
        tenancyId: q.tenancyId,
      }),
    );
  }

  private async ownInvoice(tenantId: string, invoiceId: string) {
    const i = await this.invoices.get(invoiceId);
    if (i.tenant.id !== tenantId) throw AppError.notFound('Invoice');
    return i;
  }

  invoice(tenantId: string, invoiceId: string) {
    return this.as(tenantId, () => this.ownInvoice(tenantId, invoiceId));
  }

  invoicePdf(tenantId: string, invoiceId: string) {
    return this.as(tenantId, async () => {
      await this.ownInvoice(tenantId, invoiceId);
      return this.invoices.forPdf(invoiceId);
    });
  }

  statement(tenantId: string, q: { from?: string; to?: string }) {
    return this.as(tenantId, () => this.accounts.statement(tenantId, q));
  }

  statementPdf(tenantId: string, q: { from?: string; to?: string }) {
    return this.as(tenantId, () => this.accounts.forStatementPdf(tenantId, q));
  }

  paymentsList(tenantId: string, q: PaginationQueryDto) {
    return this.as(tenantId, () =>
      this.payments.list({ page: q.page, pageSize: q.pageSize, tenantId }),
    );
  }

  receipt(tenantId: string, paymentId: string) {
    return this.as(tenantId, async () => {
      const data = await this.payments.forReceipt(paymentId);
      if (data.payment.tenant.id !== tenantId) throw AppError.notFound('Payment');
      return data;
    });
  }

  pay(tenantId: string, dto: TenantPayDto, idempotencyKey?: string) {
    return this.as(tenantId, async () => {
      const channel = this.tenantAccounts.stkChannel(
        await this.tenantAccounts.channelsFor(await this.tenantAccounts.propertiesOf(tenantId)),
      );
      if (!channel)
        throw AppError.conflict(
          'Paying in the app isn’t set up yet. Use the paybill instead.',
          'NO_MPESA',
        );
      return this.stk.push(
        { tenantId, channelId: channel.id, amount: dto.amount, phone: dto.phone },
        idempotencyKey,
      );
    });
  }

  payStatus(tenantId: string, stkId: string) {
    return this.as(tenantId, async () => {
      const r = await this.stk.get(stkId);
      if (r.tenant?.id !== tenantId) throw AppError.notFound('Payment request');
      return r;
    });
  }

  requestsList(tenantId: string, q: PaginationQueryDto) {
    return this.as(tenantId, () => this.maintenance.listForTenant(tenantId, q));
  }

  createRequest(tenantId: string, dto: CreateTenantMaintenanceRequestDto) {
    return this.as(tenantId, () => this.maintenance.createForTenant(tenantId, dto));
  }

  uploadMaintenancePhoto(tenantId: string, file?: { buffer: Buffer; size: number }) {
    return this.as(tenantId, () => this.uploads.create('MAINTENANCE_PHOTO', file));
  }

  requestPhoto(tenantId: string, requestId: string, uploadId: string) {
    return this.as(tenantId, async () => {
      const req = await this.maintenance.get(requestId);
      if (req.tenant?.id !== tenantId) throw AppError.notFound('Maintenance request');
      return this.maintenance.photoContent(requestId, uploadId);
    });
  }

  /** The tenant's own tenancy, or 404. */
  private async ownTenancy(tenantId: string, tenancyId: string) {
    const t = await this.db.tenancy.findFirst({
      where: { id: tenancyId, tenantId },
      select: { id: true },
    });
    if (!t) throw AppError.notFound('Tenancy');
  }

  inspections(tenantId: string, tenancyId: string) {
    return this.as(tenantId, async () => {
      await this.ownTenancy(tenantId, tenancyId);
      return this.inspectionRecords.list(tenancyId);
    });
  }

  acknowledgeInspection(tenantId: string, tenancyId: string, kind: InspectionKind) {
    return this.as(tenantId, async () => {
      await this.ownTenancy(tenantId, tenancyId);
      return this.inspectionRecords.acknowledge(tenancyId, kind);
    });
  }

  inspectionPhoto(tenantId: string, tenancyId: string, kind: InspectionKind, uploadId: string) {
    return this.as(tenantId, async () => {
      await this.ownTenancy(tenantId, tenancyId);
      return this.inspectionRecords.photo(tenancyId, kind, uploadId);
    });
  }

  inspectionPdf(tenantId: string, tenancyId: string, kind: InspectionKind) {
    return this.as(tenantId, async () => {
      await this.ownTenancy(tenantId, tenancyId);
      return this.inspectionRecords.pdf(tenancyId, kind);
    });
  }

  leasePdf(tenantId: string, tenancyId: string) {
    return this.as(tenantId, async () => {
      const data = await this.tenancies.forLeasePdf(tenancyId);
      if (data.tenancy.tenant.id !== tenantId) throw AppError.notFound('Tenancy');
      return data;
    });
  }

  leaseDocument(tenantId: string, tenancyId: string) {
    return this.as(tenantId, async () => {
      const t = await this.tenancies.get(tenancyId);
      if (t.tenant.id !== tenantId) throw AppError.notFound('Tenancy');
      return this.tenancies.leaseDocument(tenancyId);
    });
  }
}
