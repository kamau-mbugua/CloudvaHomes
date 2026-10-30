import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { ok } from '../../common/http/response.js';
import { Public, RequirePermission } from '../auth/decorators.js';
import { renderInvoicePdf } from '../billing/invoices/invoice-pdf.js';
import { sendFile } from '../files/uploads.controller.js';
import { MAX_UPLOAD_BYTES } from '../files/uploads.service.js';
import { JobsGuard } from '../jobs/job-auth.js';
import { CreateTenantMaintenanceRequestDto } from '../maintenance/maintenance.dto.js';
import { StatementQueryDto } from '../payments/payments.dto.js';
import { renderReceiptPdf, renderStatementPdf } from '../payments/pdfs.js';
import { renderLeasePdf } from '../portfolio/tenancies/lease-pdf.js';
import { MessagesService } from './messages.service.js';
import { TenantAccountsService } from './tenant-accounts.service.js';
import {
  BulkPortalDto,
  ListMessagesQueryDto,
  TenantInvoicesQueryDto,
  TenantPayDto,
} from './tenant-portal.dto.js';
import { TenantPortalService } from './tenant-portal.service.js';

function pdf(res: Response, filename: string, data: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(data);
}

function key(raw?: string) {
  const k = raw?.trim();
  if (k && k.length > 100)
    throw AppError.validation([{ field: 'Idempotency-Key', message: 'At most 100 characters' }]);
  return k || undefined;
}

@ApiTags('Tenant portal (staff)')
@ApiBearerAuth()
@Controller()
export class TenantAccessController {
  constructor(
    private readonly accounts: TenantAccountsService,
    private readonly messages: MessagesService,
  ) {}

  /** All current tenants (optionally of one property) without access yet. */
  @Post('tenants/portal-access')
  @HttpCode(200)
  @RequirePermission('tenants:update')
  async grantAll(@Body() dto: BulkPortalDto) {
    return ok(await this.accounts.grantAll(dto.propertyId));
  }

  @Post('tenants/:id/portal-access')
  @HttpCode(200)
  @RequirePermission('tenants:update')
  async grant(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.accounts.grant(id));
  }

  @Delete('tenants/:id/portal-access')
  @RequirePermission('tenants:update')
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.accounts.revoke(id));
  }

  /** Texts the tenant their current balance and how to pay. */
  @Post('tenants/:id/reminder')
  @HttpCode(200)
  @RequirePermission('tenants:update')
  async remind(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.accounts.remindNow(id));
  }

  /** Runs today's automatic due-soon and overdue reminders for the active organisation. */
  @Post('tenants/run-reminders')
  @HttpCode(200)
  @RequirePermission('tenants:update')
  async runReminders() {
    return ok(await this.accounts.runReminders());
  }

  @Get('messages')
  @RequirePermission('tenants:view')
  list(@Query() q: ListMessagesQueryDto) {
    return this.messages.list(q);
  }
}

/** The tenant's own account: any signed-in user, limited to the tenants linked to them. */
@ApiTags('Tenant portal')
@ApiBearerAuth()
@Controller('tenant/accounts')
export class TenantPortalController {
  constructor(private readonly portal: TenantPortalService) {}

  @Get()
  async mine() {
    return ok(await this.portal.mine());
  }

  @Get(':id')
  async overview(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.portal.overview(id));
  }

  @Get(':id/invoices')
  invoices(@Param('id', ParseUUIDPipe) id: string, @Query() q: TenantInvoicesQueryDto) {
    return this.portal.invoicesList(id, q);
  }

  @Get(':id/invoices/:invoiceId')
  async invoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return ok(await this.portal.invoice(id, invoiceId));
  }

  @Get(':id/invoices/:invoiceId/pdf')
  @ApiProduces('application/pdf')
  async invoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.portal.invoicePdf(id, invoiceId);
    return pdf(res, `${data.invoice.number}.pdf`, await renderInvoicePdf(data));
  }

  @Get(':id/statement')
  async statement(@Param('id', ParseUUIDPipe) id: string, @Query() q: StatementQueryDto) {
    return ok(await this.portal.statement(id, q));
  }

  @Get(':id/statement/pdf')
  @ApiProduces('application/pdf')
  async statementPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.portal.statementPdf(id, q);
    return pdf(res, `statement-${data.statement.tenant.code}.pdf`, await renderStatementPdf(data));
  }

  @Get(':id/payments')
  payments(@Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.portal.paymentsList(id, q);
  }

  @Get(':id/payments/:paymentId/receipt')
  @ApiProduces('application/pdf')
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.portal.receipt(id, paymentId);
    return pdf(res, `${data.payment.number}.pdf`, await renderReceiptPdf(data));
  }

  /** Sends an M-Pesa prompt to the tenant's phone. Poll GET …/pay/:stkId. */
  @Post(':id/pay')
  @HttpCode(202)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TenantPayDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return ok(await this.portal.pay(id, dto, key(k)));
  }

  @Get(':id/pay/:stkId')
  async payStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stkId', ParseUUIDPipe) stkId: string,
  ) {
    return ok(await this.portal.payStatus(id, stkId));
  }

  @Get(':id/requests')
  requests(@Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.portal.requestsList(id, q);
  }

  @Post(':id/requests')
  async createRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTenantMaintenanceRequestDto,
  ) {
    return ok(await this.portal.createRequest(id, dto));
  }

  @Post(':id/uploads')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile()
    file?: { buffer: Buffer; size: number },
  ) {
    return ok(await this.portal.uploadMaintenancePhoto(id, file));
  }

  @Get(':id/requests/:requestId/photos/:uploadId')
  async requestPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { upload, data } = await this.portal.requestPhoto(id, requestId, uploadId);
    return sendFile(res, upload, data);
  }

  @Get(':id/tenancies/:tenancyId/lease/pdf')
  @ApiProduces('application/pdf')
  async leasePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tenancyId', ParseUUIDPipe) tenancyId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.portal.leasePdf(id, tenancyId);
    const filename = `Lease-${data.tenancy.unit.property.code}-${data.tenancy.unit.number}.pdf`;
    return pdf(res, filename, await renderLeasePdf(data));
  }

  @Get(':id/tenancies/:tenancyId/lease-document')
  async leaseDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tenancyId', ParseUUIDPipe) tenancyId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { upload, data } = await this.portal.leaseDocument(id, tenancyId);
    return sendFile(res, upload, data);
  }
}

/** Cloud Scheduler, daily 09:00 Nairobi. */
@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class ReminderJobsController {
  constructor(private readonly accounts: TenantAccountsService) {}

  @Post('reminders')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async reminders() {
    return { data: await this.accounts.runRemindersAll() };
  }

  @Post('rent-reminders')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async rentReminders() {
    return { data: await this.accounts.runRemindersAll() };
  }
}
