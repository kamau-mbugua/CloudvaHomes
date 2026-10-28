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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../common/errors/app-error.js';
import { ok } from '../../common/http/response.js';
import { Public, RequirePermission, AllowWhenSuspended } from '../auth/decorators.js';
import { JobsGuard } from '../jobs/job-auth.js';
import { DarajaConfigService } from './daraja-config.service.js';
import { InboundService } from './inbound.service.js';
import {
  AssignInboundDto,
  IgnoreInboundDto,
  ListInboundQueryDto,
  ListStkQueryDto,
  SetDarajaDto,
  StkPushDto,
} from './mpesa.dto.js';
import { StkService } from './stk.service.js';

@ApiTags('M-Pesa')
@ApiBearerAuth()
@Controller()
export class MpesaController {
  constructor(
    private readonly config: DarajaConfigService,
    private readonly stk: StkService,
    private readonly inbound: InboundService,
  ) {}

  /** Daraja credentials (write-only). Needs a fresh one-time code (X-Step-Up). */
  @Put('payment-channels/:id/daraja')
  @RequirePermission('channels:manage')
  async setDaraja(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetDarajaDto) {
    return ok(await this.config.set(id, dto));
  }

  @Delete('payment-channels/:id/daraja')
  @RequirePermission('channels:manage')
  async removeDaraja(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.config.remove(id));
  }

  @Post('payment-channels/:id/daraja/rotate-token')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  async rotate(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.config.rotate(id));
  }

  @Post('payment-channels/:id/daraja/register-c2b')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  async registerC2b(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.config.registerC2b(id));
  }

  /** Sends an M-Pesa payment prompt to the tenant's phone. Poll GET /stk-requests/:id. */
  @Post('stk-requests')
  @HttpCode(202)
  @RequirePermission('payments:create')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @AllowWhenSuspended()
  async push(@Body() dto: StkPushDto, @Headers('idempotency-key') key?: string) {
    const k = key?.trim();
    if (k && k.length > 100)
      throw AppError.validation([{ field: 'Idempotency-Key', message: 'At most 100 characters' }]);
    return ok(await this.stk.push(dto, k || undefined));
  }

  @Get('stk-requests')
  @RequirePermission('payments:view')
  listStk(@Query() q: ListStkQueryDto) {
    return this.stk.list(q);
  }

  @Get('stk-requests/:id')
  @RequirePermission('payments:view')
  async getStk(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.stk.get(id));
  }

  @Get('inbound-transactions')
  @RequirePermission('reconciliation:view')
  listInbound(@Query() q: ListInboundQueryDto) {
    return this.inbound.list(q);
  }

  @Get('inbound-transactions/:id')
  @RequirePermission('reconciliation:view')
  async getInbound(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.inbound.get(id));
  }

  @Post('inbound-transactions/:id/assign')
  @HttpCode(200)
  @RequirePermission('reconciliation:update')
  @AllowWhenSuspended()
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignInboundDto) {
    return ok(await this.inbound.assign(id, dto));
  }

  @Post('inbound-transactions/:id/ignore')
  @HttpCode(200)
  @RequirePermission('reconciliation:update')
  async ignore(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IgnoreInboundDto) {
    return ok(await this.inbound.ignore(id, dto));
  }

  @Post('inbound-transactions/:id/unignore')
  @HttpCode(200)
  @RequirePermission('reconciliation:update')
  async unignore(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.inbound.unignore(id));
  }
}

/** Cloud Scheduler, every minute: catches STK callbacks that never came. */
@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class MpesaJobsController {
  constructor(private readonly stk: StkService) {}

  @Post('stk-sweep')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async sweep() {
    return { data: await this.stk.sweep() };
  }
}
