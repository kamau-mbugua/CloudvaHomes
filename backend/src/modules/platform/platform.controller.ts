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
  PlatformOperatorOnly,
  Public,
  RequirePermission,
} from '../auth/decorators.js';
import { JobsGuard } from '../jobs/job-auth.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformBillingService } from './platform-billing.service.js';
import { PlatformPayService } from './platform-pay.service.js';
import { renderPlatformInvoicePdf } from './platform-pdf.js';
import { PlatformReportsService } from './platform-reports.service.js';
import {
  AssignOrganizationsDto,
  BillingPayDto,
  CreateOperatorDto,
  CreatePlanDto,
  InvoicesReportQueryDto,
  ListEmailLogsQueryDto,
  ListOrgsQueryDto,
  ListPlatformInvoicesDto,
  ListPlatformPaymentsDto,
  PlatformAuditQueryDto,
  PlatformSettingsDto,
  RecordPlatformPaymentDto,
  ReportDateRangeQueryDto,
  RunPlatformDto,
  SendBroadcastEmailDto,
  SendTestEmailDto,
  SendTestEmailTemplateDto,
  UpdateEmailSettingsDto,
  UpdateEmailTemplateDto,
  UpdateOperatorDto,
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
@PlatformOperatorOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly admin: PlatformAdminService,
    private readonly billing: PlatformBillingService,
    private readonly pay: PlatformPayService,
    private readonly reports: PlatformReportsService,
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
  @PlatformAdminOnly()
  async createPlan(@Body() dto: CreatePlanDto) {
    return ok(await this.admin.createPlan(dto));
  }

  @Patch('plans/:id')
  @PlatformAdminOnly()
  async updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return ok(await this.admin.updatePlan(id, dto));
  }

  @Delete('plans/:id')
  @PlatformAdminOnly()
  @HttpCode(204)
  async deletePlan(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.deletePlan(id);
  }

  @Get('organizations')
  async organizations(@Query() q: ListOrgsQueryDto) {
    return this.admin.organizations(q);
  }

  @Get('organizations/unassigned')
  @PlatformAdminOnly()
  async unassignedOrganizations() {
    return ok(await this.admin.unassignedOrganizations());
  }

  @Get('organizations/:id')
  async organization(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.admin.organization(id));
  }

  @Patch('organizations/:id')
  @PlatformAdminOnly()
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
  @PlatformAdminOnly()
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
  @PlatformAdminOnly()
  @HttpCode(200)
  async void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidPlatformInvoiceDto) {
    return ok(await this.billing.voidInvoice(id, dto.reason));
  }

  @Get('payments')
  async payments(@Query() q: ListPlatformPaymentsDto) {
    return withoutOrgScope(() => this.billing.payments(q));
  }

  @Post('payments')
  @PlatformAdminOnly()
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
  @PlatformAdminOnly()
  async settings() {
    return ok(await this.pay.getSettings());
  }

  @Put('settings')
  @PlatformAdminOnly()
  async updateSettings(@Body() dto: PlatformSettingsDto) {
    return ok(await this.pay.updateSettings(dto));
  }

  // ── Operators (Superadmins & Salespeople) ──

  @Get('operators')
  @PlatformAdminOnly()
  async operators() {
    return ok(await this.admin.operators());
  }

  @Post('operators')
  @PlatformAdminOnly()
  async createOperator(@Body() dto: CreateOperatorDto) {
    return ok(await this.admin.createOperator(dto));
  }

  @Patch('operators/:id')
  @PlatformAdminOnly()
  async updateOperator(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOperatorDto) {
    return ok(await this.admin.updateOperator(id, dto));
  }

  @Post('operators/:id/assign-organizations')
  @PlatformAdminOnly()
  @HttpCode(200)
  async assignOrganizations(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOrganizationsDto,
  ) {
    return ok(await this.admin.assignOrganizations(id, dto));
  }

  // ── Email SMTP, Broadcast & Logs ──

  @Get('email/settings')
  @PlatformAdminOnly()
  async emailSettings() {
    return ok(await this.admin.getEmailSettings());
  }

  @Put('email/settings')
  @PlatformAdminOnly()
  async updateEmailSettings(@Body() dto: UpdateEmailSettingsDto) {
    return ok(await this.admin.updateEmailSettings(dto));
  }

  @Post('email/test')
  @PlatformAdminOnly()
  @HttpCode(200)
  async sendTestEmail(@Body() dto: SendTestEmailDto) {
    return ok(await this.admin.sendTestEmail(dto.to));
  }

  @Post('email/broadcast')
  @PlatformAdminOnly()
  @HttpCode(200)
  async sendBroadcastEmail(@Body() dto: SendBroadcastEmailDto) {
    return ok(await this.admin.sendBroadcastEmail(dto));
  }

  @Get('email/logs')
  @PlatformAdminOnly()
  async emailLogs(@Query() q: ListEmailLogsQueryDto) {
    return this.admin.emailLogs(q);
  }

  @Get('email/templates')
  @PlatformAdminOnly()
  async emailTemplates() {
    return ok(await this.admin.getEmailTemplates());
  }

  @Put('email/templates/:key')
  @PlatformAdminOnly()
  async updateEmailTemplate(@Param('key') key: string, @Body() dto: UpdateEmailTemplateDto) {
    return ok(await this.admin.updateEmailTemplate(key, dto));
  }

  @Post('email/templates/:key/test')
  @PlatformAdminOnly()
  @HttpCode(200)
  async sendTestEmailTemplate(@Param('key') key: string, @Body() dto: SendTestEmailTemplateDto) {
    return ok(await this.admin.sendTestEmailTemplate(key, dto));
  }

  // ── Security / OTP Locks ──

  @Get('security/locks')
  @PlatformAdminOnly()
  async locks() {
    return ok(await this.admin.locks());
  }

  @Delete('security/locks')
  @PlatformAdminOnly()
  async clearLocks(@Query('key') key?: string) {
    return ok(await this.admin.clearLocks(key));
  }

  // ── Superadmin Reports ──

  @Get('reports/collections')
  @PlatformAdminOnly()
  async collectionsReport(@Query() q: ReportDateRangeQueryDto) {
    return ok(await this.reports.collections(q));
  }

  @Get('reports/aged-receivables')
  @PlatformAdminOnly()
  async agedReceivablesReport() {
    return ok(await this.reports.agedReceivables());
  }

  @Get('reports/activity')
  @PlatformAdminOnly()
  async activityReport() {
    return ok(await this.reports.activity());
  }

  @Get('reports/subscription-changes')
  @PlatformAdminOnly()
  async subscriptionChangesReport(@Query() q: ReportDateRangeQueryDto) {
    return ok(await this.reports.subscriptionChanges(q));
  }

  @Get('reports/onboarding')
  @PlatformAdminOnly()
  async onboardingReport(@Query() q: ReportDateRangeQueryDto) {
    return ok(await this.reports.onboarding(q));
  }

  @Get('reports/invoices')
  @PlatformAdminOnly()
  async invoicesReport(@Query() q: InvoicesReportQueryDto) {
    return ok(await this.reports.invoicesReport(q));
  }

  @Get('reports/plans')
  @PlatformAdminOnly()
  async planPerformanceReport(@Query() q: ReportDateRangeQueryDto) {
    return ok(await this.reports.planPerformance(q));
  }

  @Get('reports/reconciliation')
  @PlatformAdminOnly()
  async reconciliationReport() {
    return ok(await this.reports.reconciliation());
  }

  @Get('reports/price-variance')
  @PlatformAdminOnly()
  async priceVarianceReport() {
    return ok(await this.reports.priceVariance());
  }

  @Get('reports/salespeople')
  @PlatformAdminOnly()
  async salespeopleReport(@Query() q: ReportDateRangeQueryDto) {
    return ok(await this.reports.salespeople(q));
  }

  @Get('reports/audit')
  @PlatformAdminOnly()
  async auditReport(@Query() q: PlatformAuditQueryDto) {
    return this.reports.auditLogs(q);
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
