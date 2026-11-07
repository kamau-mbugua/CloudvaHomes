import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import {
  BookingMpesaPromptDto,
  CreateStayPaymentDto,
  CreateStayRefundDto,
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

  @Post('mpesa-prompt')
  @HttpCode(200)
  @RequirePermission('stay-payments:create')
  async promptMpesa(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BookingMpesaPromptDto) {
    return ok(await this.stayPayments.promptMpesa(id, dto));
  }
}
