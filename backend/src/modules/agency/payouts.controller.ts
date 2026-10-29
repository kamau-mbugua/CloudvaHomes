import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { ok } from '../../common/http/response.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { Public, RequirePermission } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { JobsGuard } from '../jobs/job-auth.js';
import { ipAllowed, SAFARICOM_CALLBACK_IPS } from '../mpesa/callback-ips.js';
import { BulkFileQueryDto, ResolvePayoutDto, SetB2cAccountDto } from './payouts.dto.js';
import { PayoutsService } from './payouts.service.js';

function idemKey(raw?: string) {
  const k = raw?.trim();
  if (k && k.length > 100) {
    throw AppError.validation([{ field: 'Idempotency-Key', message: 'At most 100 characters' }]);
  }
  return k || undefined;
}

/** Money out (phase 10). Registered before AgencyController so /remittances/bulk-file isn't read as an id. */
@ApiTags('Agency')
@ApiBearerAuth()
@Controller()
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('payout-accounts')
  @RequirePermission('settings:view')
  async accounts() {
    return ok(await this.payouts.accounts());
  }

  @Put('payout-accounts/b2c')
  @RequirePermission('settings:update')
  async setB2c(@Body() dto: SetB2cAccountDto) {
    return ok(await this.payouts.setB2c(dto));
  }

  @Delete('payout-accounts/b2c')
  @HttpCode(204)
  @RequirePermission('settings:update')
  async removeB2c() {
    await this.payouts.removeB2c();
  }

  @Get('remittances/bulk-file')
  @RequirePermission('remittances:pay')
  async bulkFile(@Query() q: BulkFileQueryDto, @Res({ passthrough: true }) res: Response) {
    const csv = await this.payouts.bulkFile(q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bulk-payments-${todayInNairobi()}.csv"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    return csv;
  }

  @Post('remittances/:id/send')
  @HttpCode(200)
  @RequirePermission('remittances:pay')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async send(@Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') k?: string) {
    return ok(await this.payouts.send(id, idemKey(k)));
  }

  @Post('remittances/:id/payout/resolve')
  @HttpCode(200)
  @RequirePermission('remittances:pay')
  async resolve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolvePayoutDto) {
    return ok(await this.payouts.resolve(id, dto));
  }
}

const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' };

/** Safaricom's B2C callbacks: the account's unguessable token plus Safaricom's addresses. */
@ApiExcludeController()
@Public()
@Controller('hooks/payout/:token')
export class PayoutHooksController {
  private readonly log = new Logger(PayoutHooksController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly payouts: PayoutsService,
  ) {}

  private check(req: Request) {
    if (!ipAllowed(req.ip, this.env.MPESA_CALLBACK_IPS ?? SAFARICOM_CALLBACK_IPS)) {
      this.log.warn({ ip: req.ip }, 'B2C callback from an address not on the allow-list');
      throw AppError.forbidden();
    }
  }

  @Post('result')
  @HttpCode(200)
  async result(@Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    this.check(req);
    await this.payouts.handleResult(token, body);
    return ACCEPTED;
  }

  @Post('timeout')
  @HttpCode(200)
  async timeout(@Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    this.check(req);
    await this.payouts.handleResult(token, body, true);
    return ACCEPTED;
  }
}

/** Cloud Scheduler, every 5 minutes: payouts with no answer become UNCERTAIN. */
@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class PayoutJobsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post('payout-sweep')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async sweep() {
    return { data: await this.payouts.sweep() };
  }
}
