import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import {
  BookingMpesaPromptDto,
  CreateStayPaymentDto,
  CreateStayRefundDto,
  ListStayReceiptsQueryDto,
  VoidStayPaymentDto,
} from './stay-payments.dto.js';
import { StayPaymentsService } from './stay-payments.service.js';

@Controller('host/bookings/:id')
export class StayPaymentsController {
  constructor(private readonly stayPayments: StayPaymentsService) {}

  @Post('payments')
  @RequirePermission('stay-payments:create')
  async createPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateStayPaymentDto) {
    return ok(await this.stayPayments.createManual(id, dto));
  }

  @Post('refunds')
  @RequirePermission('stay-payments:refund')
  async createRefund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateStayRefundDto) {
    return ok(await this.stayPayments.createRefund(id, dto));
  }

  @Post('payments/:paymentId/void')
  @HttpCode(200)
  @RequirePermission('stay-payments:refund')
  async voidPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: VoidStayPaymentDto,
  ) {
    return ok(await this.stayPayments.voidPayment(id, paymentId, dto));
  }

  /** The receipt PDF (shown inline, so the web app can preview it or save it). */
  @Get('payments/:paymentId/receipt')
  @RequirePermission('stay-payments:view')
  @ApiProduces('application/pdf')
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.stayPayments.receiptPdf(id, paymentId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${r.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(r.content);
  }

  /** Sends the receipt to the guest again (SMS with its link; email with the PDF). */
  @Post('payments/:paymentId/receipt/send')
  @HttpCode(200)
  @RequirePermission('stay-payments:create')
  async sendReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return ok(await this.stayPayments.sendReceipt(id, paymentId));
  }

  @Post('mpesa-prompt')
  @HttpCode(200)
  @RequirePermission('stay-payments:create')
  async promptMpesa(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BookingMpesaPromptDto) {
    return ok(await this.stayPayments.promptMpesa(id, dto));
  }
}

/** Money → Receipts for short stays. */
@Controller('host/stay-payments')
export class StayReceiptsController {
  constructor(private readonly stayPayments: StayPaymentsService) {}

  @Get()
  @RequirePermission('stay-payments:view')
  list(@Query() q: ListStayReceiptsQueryDto) {
    return this.stayPayments.listReceipts(q);
  }
}
