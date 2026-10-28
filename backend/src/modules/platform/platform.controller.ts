import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { ok } from '../../common/http/response.js';
import { formatDateOnlyOrNull, parseDateOnly } from '../../common/dates/date-only.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import {
  AllowWhenSuspended,
  orgContext,
  PlatformAdminOnly,
  Public,
  RequirePermission,
} from '../auth/decorators.js';
import { JobsGuard } from '../jobs/job-auth.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformBillingService } from './platform-billing.service.js';
import { PlatformPayService } from './platform-pay.service.js';
import { renderPlatformInvoicePdf } from './platform-pdf.js';
import {
  BillingPayDto,
  CreatePlanDto,
  ListOrgsQueryDto,
  ListPlatformInvoicesDto,
  ListPlatformPaymentsDto,
  PlatformSettingsDto,
  RecordPlatformPaymentDto,
  RunPlatformDto,
  UpdateOrgBillingDto,
  UpdatePlanDto,
  VoidPlatformInvoiceDto,
} from './platform.dto.js';

function idemKey(raw?: string) {
  const k = raw?.trim();
  if (k && k.length > 100) {
    throw AppError.validation([{ field: 'Idempotency-Key', message: 'At most 100 characters' }]);
  }
  return k || undefined;
}

async function pdf(res: Response, filename: string, data: Promise<Buffer>) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(await data);
}

/** An organisation's own Hodi plan, bill and payments. Works while suspended: that's how they pay. */
@ApiTags('Hodi billing')
@ApiBearerAuth()
@AllowWhenSuspended()
@Controller('billing')
export class BillingController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly billing: PlatformBillingService,
    private readonly pay: PlatformPayService,
  ) {}

  @Get()
  @RequirePermission('settings:view')
  async overview() {
    const { orgId } = orgContext();
    const [org, settings, balance] = await Promise.all([
      this.db.organization.findUniqueOrThrow({ where: { id: orgId } }),
      this.billing.settings(),
      this.billing.balance(orgId),
    ]);
    const plan = org.planId ? await this.db.plan.findUnique({ where: { id: org.planId } }) : null;
    return ok({
      status: org.status,
      plan: plan
        ? { name: plan.name, pricePerUnit: plan.pricePerUnit, minimumMonthly: plan.minimumMonthly }
        : null,
      price: this.billing.price(org, plan),
      trialEndsAt: formatDateOnlyOrNull(org.trialEndsAt),
      noSuspendUntil: formatDateOnlyOrNull(org.noSuspendUntil),
      billingRef: org.billingRef,
      balance: balance.balance,
      credit: org.platformCredit,
      overdue: balance.overdue,
      payTo:
        settings.paybill && org.billingRef
          ? { paybill: settings.paybill, accountRef: org.billingRef }
          : null,
      canPayInApp: this.pay.canPayInApp(settings),
    });
  }

  @Get('invoices')
  @RequirePermission('settings:view')
  async invoices(@Query() q: PaginationQueryDto) {
    return this.billing.invoices({ page: q.page, pageSize: q.pageSize, orgId: orgContext().orgId });
  }

  @Get('invoices/:id')
  @RequirePermission('settings:view')
  async invoice(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.billing.invoice(id, orgContext().orgId));
  }

  @Get('invoices/:id/pdf')
  @RequirePermission('settings:view')
  async invoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { orgId } = orgContext();
    const invoice = await this.billing.invoice(id, orgId);
    const [org, settings] = await Promise.all([
      this.db.organization.findUniqueOrThrow({ where: { id: orgId } }),
      this.billing.settings(),
    ]);
    return pdf(
      res,
      `${invoice.number}.pdf`,
      renderPlatformInvoicePdf({ invoice, org, paybill: settings.paybill }),
    );
  }

  @Get('payments')
  @RequirePermission('settings:view')
  async payments(@Query() q: PaginationQueryDto) {
    return this.billing.payments({ page: q.page, pageSize: q.pageSize, orgId: orgContext().orgId });
  }

  @Post('pay')
  @HttpCode(202)
  @RequirePermission('settings:update')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async payNow(@Body() dto: BillingPayDto, @Headers('idempotency-key') k?: string) {
    return ok(await this.pay.pay(dto, idemKey(k)));
  }

  @Get('pay/:id')
  @RequirePermission('settings:view')
  async payStatus(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.pay.getStk(id));
  }
}

@ApiTags('Platform')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly admin: PlatformAdminService,
    private readonly billing: PlatformBillingService,
    private readonly pay: PlatformPayService,
  ) {}

  @Get('stats')
  async stats() {
    return ok(await withoutOrgScope(() => this.billing.stats()));
  }

  @Get('plans')
  async plans() {
    return ok(await this.admin.plans());
  }

  @Post('plans')
  async createPlan(@Body() dto: CreatePlanDto) {
    return ok(await this.admin.createPlan(dto));
  }

  @Patch('plans/:id')
  async updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return ok(await this.admin.updatePlan(id, dto));
  }

  @Delete('plans/:id')
  @HttpCode(204)
  async deletePlan(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.deletePlan(id);
  }

  @Get('organizations')
  async organizations(@Query() q: ListOrgsQueryDto) {
    return this.admin.organizations(q);
  }

  @Get('organizations/:id')
  async organization(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.admin.organization(id));
  }

  @Patch('organizations/:id')
  async updateOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgBillingDto,
  ) {
    return ok(await this.admin.updateOrganization(id, dto));
  }

  @Get('invoices')
  async invoices(@Query() q: ListPlatformInvoicesDto) {
    return withoutOrgScope(() => this.billing.invoices(q));
  }

  @Post('invoices/run')
  @HttpCode(200)
  async run(@Body() dto: RunPlatformDto) {
    return ok(await this.billing.run(dto.period));
  }

  @Get('invoices/:id')
  async invoice(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await withoutOrgScope(() => this.billing.invoice(id)));
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const invoice = await withoutOrgScope(() => this.billing.invoice(id));
    const [org, settings] = await Promise.all([
      this.db.organization.findUniqueOrThrow({ where: { id: invoice.orgId } }),
      this.billing.settings(),
    ]);
    return pdf(
      res,
      `${invoice.number}.pdf`,
      renderPlatformInvoicePdf({ invoice, org, paybill: settings.paybill }),
    );
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  async void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidPlatformInvoiceDto) {
    return ok(await this.billing.voidInvoice(id, dto.reason));
  }

  @Get('payments')
  async payments(@Query() q: ListPlatformPaymentsDto) {
    return withoutOrgScope(() => this.billing.payments(q));
  }

  @Post('payments')
  async record(@Body() dto: RecordPlatformPaymentDto) {
    const org = await this.db.organization.findUnique({
      where: { id: dto.orgId },
      select: { id: true },
    });
    if (!org) throw AppError.fieldInvalid('orgId', 'Choose an organisation');
    const id = await this.billing.recordPayment({
      orgId: dto.orgId,
      amount: BigInt(dto.amount),
      method: dto.method,
      source: 'MANUAL',
      reference: dto.reference,
      receivedAt: parseDateOnly(dto.receivedAt),
      note: dto.note?.trim() || null,
    });
    return ok(await this.billing.payment(id));
  }

  @Get('settings')
  async settings() {
    return ok(await this.pay.getSettings());
  }

  @Put('settings')
  async updateSettings(@Body() dto: PlatformSettingsDto) {
    return ok(await this.pay.updateSettings(dto));
  }
}

/** Cloud Scheduler: bill last month on the 1st; recompute statuses daily. */
@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class PlatformJobsController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Post('platform-invoices')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async invoices() {
    return { data: await this.billing.runDue() };
  }

  @Post('platform-status')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async status() {
    return { data: await this.billing.refreshAll() };
  }
}
