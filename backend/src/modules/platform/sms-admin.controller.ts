import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { ok } from '../../common/http/response.js';
import { PlatformAdminOnly, PlatformOperatorOnly } from '../auth/decorators.js';
import {
  AdminSmsSetupDto,
  RevealSmsSecretDto,
  SmsAdjustDto,
  SmsLogsQueryDto,
  SmsReportQueryDto,
  SmsStatsQueryDto,
  SmsTestDto,
  SmsUsageQueryDto,
} from './sms.dto.js';
import { SmsLogsService } from './sms-logs.service.js';
import { SmsSettingsService } from './sms-settings.service.js';

/** KodiHub admin controls for organisations' SMS (spec §3.3, §6). */
@ApiTags('Platform')
@ApiBearerAuth()
@PlatformOperatorOnly()
@Controller('platform')
export class SmsAdminController {
  constructor(
    private readonly sms: SmsSettingsService,
    private readonly logs: SmsLogsService,
  ) {}

  @Get('organizations/:id/sms')
  @PlatformAdminOnly()
  async account(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.sms.adminView(id));
  }

  @Put('organizations/:id/sms')
  @PlatformAdminOnly()
  async setUp(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminSmsSetupDto) {
    return ok(await this.sms.adminSetup(id, dto));
  }

  @Post('organizations/:id/sms/test')
  @HttpCode(200)
  @PlatformAdminOnly()
  async test(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SmsTestDto) {
    return ok(await this.sms.adminTest(id, dto.phone));
  }

  @Post('organizations/:id/sms/adjust')
  @HttpCode(200)
  @PlatformAdminOnly()
  async adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SmsAdjustDto) {
    return ok(await this.sms.adjust(id, dto.units, dto.reason));
  }

  @Get('organizations/:id/sms/usage')
  @PlatformAdminOnly()
  async usage(@Param('id', ParseUUIDPipe) id: string, @Query() q: SmsUsageQueryDto) {
    return this.sms.usage(id, q);
  }

  @Get('organizations/:id/sms/top-ups')
  @PlatformAdminOnly()
  async topUps(@Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.sms.topUps(id, q);
  }

  @Get('reports/sms')
  @PlatformAdminOnly()
  async report(@Query() q: SmsReportQueryDto) {
    return ok(await this.sms.report(q.month));
  }

  /** One real SMS through KodiHub's chosen provider, as saved. */
  @Post('sms/test')
  @HttpCode(200)
  @PlatformAdminOnly()
  async testPlatform(@Body() dto: SmsTestDto) {
    return ok(await this.logs.test(dto.phone));
  }

  /** Every SMS on KodiHub, KodiHub's own and organisations', newest first. */
  @Get('sms/logs')
  @PlatformAdminOnly()
  async logList(@Query() q: SmsLogsQueryDto) {
    return this.logs.list(q);
  }

  /** One SMS as sent, with any code, link or password hidden. */
  @Get('sms/logs/:id')
  @PlatformAdminOnly()
  async logOne(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.logs.one(id));
  }

  /** The hidden code, link or password of one SMS; needs a reason, which is audited. */
  @Post('sms/logs/:id/reveal')
  @HttpCode(200)
  @PlatformAdminOnly()
  async reveal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevealSmsSecretDto) {
    return ok(await this.logs.reveal(id, dto.reason));
  }

  /** The SMS dashboard for a period (default: this month so far). */
  @Get('sms/stats')
  @PlatformAdminOnly()
  async stats(@Query() q: SmsStatsQueryDto) {
    return ok(await this.logs.stats(q));
  }
}
