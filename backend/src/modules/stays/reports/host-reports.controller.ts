import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sendCsv } from '../../../common/http/csv.js';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { GuestRegisterQueryDto, HostReportSummaryQueryDto } from './host-reports.dto.js';
import { HostReportsService } from './host-reports.service.js';

@ApiTags('Host — Reports')
@ApiBearerAuth()
@Controller('host/reports')
export class HostReportsController {
  constructor(private readonly reports: HostReportsService) {}

  @RequirePermission('reports:view')
  @Get('summary')
  async summary(@Query() q: HostReportSummaryQueryDto, @Res({ passthrough: true }) res: Response) {
    if (q.format === 'csv') {
      return sendCsv(res, `host-profit-${q.from}-to-${q.to}.csv`, await this.reports.csv(q));
    }
    return ok(await this.reports.summary(q));
  }

  /** Phase 22: the guest register as CSV (stays checking in within the dates). */
  @RequirePermission('guests:view')
  @Get('guest-register')
  async guestRegister(
    @Query() q: GuestRegisterQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.guestRegister(q);
    return sendCsv(res, `guest-register-${q.from}-to-${q.to}.csv`, csv);
  }
}
