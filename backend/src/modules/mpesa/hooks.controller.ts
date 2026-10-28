import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  currentContext,
  runWithContext,
  emptyContext,
} from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { PaymentChannel, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Public } from '../auth/decorators.js';
import { ipAllowed, SAFARICOM_CALLBACK_IPS } from './callback-ips.js';
import { parseC2bConfirmation } from './daraja.js';
import { InboundService } from './inbound.service.js';
import { StkService } from './stk.service.js';

const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' };

/**
 * Safaricom's callbacks. Public (no user), so each request proves itself with the channel's
 * unguessable token and Safaricom's source address; then runs as the channel's organisation.
 * Bodies are never logged in full (they hold names and phone numbers).
 */
@ApiExcludeController()
@Public()
@Controller('hooks/pay/:token')
export class HooksController {
  private readonly log = new Logger(HooksController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly stk: StkService,
    private readonly inbound: InboundService,
  ) {}

  private async channel(token: string, req: Request): Promise<PaymentChannel> {
    const allowed = this.env.MPESA_CALLBACK_IPS ?? SAFARICOM_CALLBACK_IPS;
    if (!ipAllowed(req.ip, allowed)) {
      this.log.warn({ ip: req.ip }, 'M-Pesa callback from an address not on the allow-list');
      throw AppError.forbidden();
    }
    const channel = await this.prisma.paymentChannel.findUnique({
      where: { callbackToken: token },
    });
    if (!channel?.secretsEnc) throw new NotFoundException();
    return channel;
  }

  /** Run as the channel's organisation so org scoping and the audit log apply. */
  private asOrg<T>(channel: PaymentChannel, fn: () => Promise<T>): Promise<T> {
    const ctx = currentContext();
    return runWithContext(
      emptyContext({
        orgId: channel.orgId,
        requestId: ctx?.requestId ?? null,
        ip: ctx?.ip ?? null,
      }),
      fn,
    );
  }

  @Post('stk')
  @HttpCode(200)
  async stkCallback(@Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    const channel = await this.channel(token, req);
    await this.asOrg(channel, () => this.stk.handleCallback(channel, body));
    return ACCEPTED;
  }

  /** Payment about to be made to the paybill: always accept (refusing would bounce rent). */
  @Post('c2b/validate')
  @HttpCode(200)
  async validate(@Param('token') token: string, @Req() req: Request) {
    await this.channel(token, req);
    return ACCEPTED;
  }

  @Post('c2b/confirm')
  @HttpCode(200)
  async confirm(@Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    const channel = await this.channel(token, req);
    const c = parseC2bConfirmation(body);
    if (!c) {
      this.log.warn({ channelId: channel.id }, 'C2B confirmation that could not be parsed');
      return ACCEPTED;
    }
    if (c.shortcode && channel.shortcode && c.shortcode !== channel.shortcode) {
      this.log.warn({ channelId: channel.id }, 'C2B confirmation for another shortcode');
      return ACCEPTED;
    }
    await this.asOrg(channel, () =>
      this.inbound.receive(channel, {
        source: 'MPESA_C2B',
        providerRef: c.receipt,
        amount: c.amount,
        payerName: c.payerName,
        payerPhone: c.phone,
        accountRef: c.accountRef,
        occurredAt: c.occurredAt,
        raw: body as Prisma.InputJsonValue,
      }),
    );
    return ACCEPTED;
  }
}
