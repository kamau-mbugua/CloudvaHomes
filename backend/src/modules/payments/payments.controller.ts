import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../common/errors/app-error.js';
import type { Response } from 'express';
import { ok } from '../../common/http/response.js';
import { RequireAnyPermission, RequirePermission, AllowWhenSuspended } from '../auth/decorators.js';
import { AccountsService } from './accounts.service.js';
import {
  CreatePaymentDto,
  ListPaymentsQueryDto,
  ReversePaymentDto,
  SettleDepositDto,
  StatementQueryDto,
} from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import { renderReceiptPdf, renderStatementPdf } from './pdfs.js';

function pdf(res: Response, filename: string, data: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(data);
}

@ApiTags('Payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly accounts: AccountsService,
  ) {}

  @Get('payments')
  @RequirePermission('payments:view')
  list(@Query() q: ListPaymentsQueryDto) {
    return this.payments.list(q);
  }

  /** Records money received, allocates it (oldest due first unless given) and sends a receipt. */
  @Post('payments')
  @RequirePermission('payments:create')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Retry-safe key (≤100 chars)',
  })
  @AllowWhenSuspended()
  async create(@Body() dto: CreatePaymentDto, @Headers('idempotency-key') key?: string) {
    const k = key?.trim();
    if (k && k.length > 100)
      throw AppError.validation([{ field: 'Idempotency-Key', message: 'At most 100 characters' }]);
    return ok(await this.payments.create(dto, k || undefined));
  }

  @Get('payments/:id')
  @RequirePermission('payments:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.payments.get(id));
  }

  @Get('payments/:id/receipt')
  @RequirePermission('payments:view')
  @ApiProduces('application/pdf')
  async receipt(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const data = await this.payments.forReceipt(id);
    return pdf(res, `${data.payment.number}.pdf`, await renderReceiptPdf(data));
  }

  @Post('payments/:id/reverse')
  @HttpCode(200)
  @RequirePermission('payments:refund')
  async reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReversePaymentDto) {
    return ok(await this.payments.reverse(id, dto));
  }

  @Get('tenants/:id/open-invoices')
  @RequirePermission('payments:view')
  async openInvoices(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.payments.openInvoices(id));
  }

  @Post('tenants/:id/apply-credit')
  @HttpCode(200)
  @RequirePermission('payments:create')
  async applyCredit(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.payments.applyCredit(id));
  }

  @Get('tenants/:id/statement')
  @RequirePermission('payments:view')
  async statement(@Param('id', ParseUUIDPipe) id: string, @Query() q: StatementQueryDto) {
    return ok(await this.accounts.statement(id, q));
  }

  @Get('tenants/:id/statement/pdf')
  @RequirePermission('payments:view')
  @ApiProduces('application/pdf')
  async statementPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.accounts.forStatementPdf(id, q);
    return pdf(res, `statement-${data.statement.tenant.code}.pdf`, await renderStatementPdf(data));
  }

  @Get('tenancies/:id/deposit')
  @RequirePermission('payments:view')
  async deposit(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.accounts.deposit(id));
  }

  /** Apply needs payments:create, refund needs payments:refund (checked per amount). */
  @Post('tenancies/:id/deposit/settle')
  @HttpCode(200)
  @RequireAnyPermission('payments:create', 'payments:refund')
  async settle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleDepositDto) {
    return ok(await this.accounts.settleDeposit(id, dto));
  }
}
