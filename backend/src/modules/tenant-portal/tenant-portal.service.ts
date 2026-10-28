import { Inject, Injectable } from '@nestjs/common';
import {
  currentContext,
  emptyContext,
  runWithContext,
} from '../../common/context/request-context.js';
import { formatDateOnly, formatDateOnlyOrNull } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authContext } from '../auth/decorators.js';
import { InvoicesService } from '../billing/invoices/invoices.service.js';
import { StkService } from '../mpesa/stk.service.js';
import { AccountsService } from '../payments/accounts.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { TenantAccountsService } from './tenant-accounts.service.js';
import type { TenantInvoicesQueryDto, TenantPayDto } from './tenant-portal.dto.js';
import type { PaginationQueryDto } from '../../common/http/pagination.js';

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
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly accounts: AccountsService,
    private readonly stk: StkService,
    private readonly tenantAccounts: TenantAccountsService,
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
        permissions: new Set(['tenants:view', 'invoices:view', 'payments:view']),
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
        },
      });
      const current = tenancies.filter((x) => x.status !== 'ENDED');
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
          billingDay: x.billingDay,
          status: x.status,
          startDate: formatDateOnly(x.startDate),
          endDate: formatDateOnlyOrNull(x.endDate),
        })),
        openInvoices: await this.payments.openInvoices(tenantId),
        howToPay: this.tenantAccounts.howToPay(channels, tenant.code),
        canPayInApp: !!this.tenantAccounts.stkChannel(channels),
      };
    });
  }

  invoicesList(tenantId: string, q: TenantInvoicesQueryDto) {
    return this.as(tenantId, () =>
      this.invoices.list({ page: q.page, pageSize: q.pageSize, status: q.status, tenantId }),
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
}
