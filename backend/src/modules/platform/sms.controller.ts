import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../common/errors/app-error.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { ok } from '../../common/http/response.js';
import { orgContext, RequirePermission } from '../auth/decorators.js';
import { BuySmsDto } from './platform.dto.js';
import { PlatformPayService } from './platform-pay.service.js';
import { SmsPurchasesService } from './sms-purchases.service.js';
import { UpdateSmsDto, SmsUsageQueryDto } from './sms.dto.js';
import { SmsSettingsService } from './sms-settings.service.js';

function idemKey(raw?: string) {
  const k = raw?.trim();
  if (k && k.length > 100) {
    throw AppError.validation([{ field: 'Idempotency-Key', message: 'At most 100 characters' }]);
  }
  return k || undefined;
}

/** An organisation's SMS units (docs/specs/2026-11-08-sms-platform-and-org-design.md §5–6). */
@ApiTags('SMS')
@ApiBearerAuth()
@Controller('sms')
export class SmsController {
  constructor(
    private readonly pay: PlatformPayService,
    private readonly purchases: SmsPurchasesService,
    private readonly settings: SmsSettingsService,
  ) {}

  @Get()
  @RequirePermission('sms:view')
  async account() {
    return ok(await this.settings.view(orgContext().orgId));
  }

  @Patch()
  @RequirePermission('sms:manage')
  async update(@Body() dto: UpdateSmsDto) {
    return ok(await this.settings.update(orgContext().orgId, dto));
  }

  @Get('usage')
  @RequirePermission('sms:view')
  async usage(@Query() q: SmsUsageQueryDto) {
    return this.settings.usage(orgContext().orgId, q);
  }

  @Get('top-ups')
  @RequirePermission('sms:view')
  async topUps(@Query() q: PaginationQueryDto) {
    return this.settings.topUps(orgContext().orgId, q);
  }

  @Get('quote')
  @RequirePermission('sms:view')
  async quote() {
    const qt = await this.purchases.quote(orgContext().orgId);
    return ok({ ...qt, unitPrice: qt.unitPrice.toString() });
  }

  @Post('buy')
  @HttpCode(202)
  @RequirePermission('sms:manage')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async buy(@Body() dto: BuySmsDto, @Headers('idempotency-key') k?: string) {
    return ok(await this.pay.buySms(dto, idemKey(k)));
  }

  @Get('buy/:id')
  @RequirePermission('sms:view')
  async purchase(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.purchases.get(orgContext().orgId, id));
  }
}
