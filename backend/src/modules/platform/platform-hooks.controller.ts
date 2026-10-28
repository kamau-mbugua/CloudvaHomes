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
import type { PlatformSettings } from '../../generated/prisma/client.js';
import { AppError } from '../../common/errors/app-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { Public } from '../auth/decorators.js';
import { ipAllowed, SAFARICOM_CALLBACK_IPS } from '../mpesa/callback-ips.js';
import { parseC2bConfirmation } from '../mpesa/daraja.js';
import { PlatformPayService } from './platform-pay.service.js';

const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' };

/** Safaricom's callbacks for Hodi's own paybill. Same checks as the organisations' hooks. */
@ApiExcludeController()
@Public()
@Controller('hooks/platform/:token')
export class PlatformHooksController {
  private readonly log = new Logger(PlatformHooksController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly pay: PlatformPayService,
  ) {}

  private async settings(token: string, req: Request): Promise<PlatformSettings> {
    if (!ipAllowed(req.ip, this.env.MPESA_CALLBACK_IPS ?? SAFARICOM_CALLBACK_IPS)) {
      this.log.warn({ ip: req.ip }, 'Hodi M-Pesa callback from an address not on the allow-list');
      throw AppError.forbidden();
    }
    const s = await this.pay.settingsByToken(token);
    if (!s) throw new NotFoundException();
    return s;
  }

  @Post('stk')
  @HttpCode(200)
  async stk(@Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    const s = await this.settings(token, req);
    await this.pay.handleStkCallback(s, body);
    return ACCEPTED;
  }

  @Post('c2b/validate')
  @HttpCode(200)
  async validate(@Param('token') token: string, @Req() req: Request) {
    await this.settings(token, req);
    return ACCEPTED;
  }

  @Post('c2b/confirm')
  @HttpCode(200)
  async confirm(@Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    const s = await this.settings(token, req);
    const c = parseC2bConfirmation(body);
    if (!c) {
      this.log.warn('Hodi C2B confirmation that could not be parsed');
      return ACCEPTED;
    }
    if (c.shortcode && s.paybill && c.shortcode !== s.paybill) {
      this.log.warn('Hodi C2B confirmation for another shortcode');
      return ACCEPTED;
    }
    await this.pay.handleC2b(c, body);
    return ACCEPTED;
  }
}
