import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { Response } from 'express';
import { sendCsv } from '../../common/http/csv.js';
import { ok } from '../../common/http/response.js';
import { RequirePermission } from '../auth/decorators.js';
import { periodOf, todayInNairobi } from '../billing/billing-math.js';
import { IsPeriod } from '../billing/billing.dto.js';
import { ReportsService } from './reports.service.js';

class FormatDto {
  @ApiPropertyOptional({ enum: ['json', 'csv'] })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}

class DashboardQueryDto {
  @IsPeriod({ optional: true })
  @IsOptional()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}

class PnlQueryDto extends FormatDto {
  @IsPeriod({ optional: true })
  @IsOptional()
  from?: string;

  @IsPeriod({ optional: true })
  @IsOptional()
  to?: string;
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermission('reports:view')
  async dashboard(@Query() q: DashboardQueryDto) {
    return ok(await this.reports.dashboard(q.period, q.propertyId));
  }

  /** Months `from`–`to` (default: this month). `?format=csv` downloads it. */
  @Get('property-pnl')
  @RequirePermission('reports:view')
  async pnl(@Query() q: PnlQueryDto, @Res({ passthrough: true }) res: Response) {
    const month = periodOf(todayInNairobi());
    const r = await this.reports.propertyPnl({
      from: q.from ?? q.to ?? month,
      to: q.to ?? q.from ?? month,
      propertyId: q.propertyId,
    });
    return q.format === 'csv'
      ? sendCsv(res, `profit-and-loss-${r.from}-to-${r.to}.csv`, this.reports.pnlCsv(r))
      : ok(r);
  }

  @Get('arrears')
  @RequirePermission('reports:view')
  async arrears(@Query() q: FormatDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.reports.arrears(q);
    return q.format === 'csv'
      ? sendCsv(res, `arrears-${r.asOf}.csv`, this.reports.arrearsCsv(r))
      : ok(r);
  }

  @Get('occupancy')
  @RequirePermission('reports:view')
  async occupancy(@Query() q: FormatDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.reports.occupancy(q);
    return q.format === 'csv'
      ? sendCsv(res, `occupancy-${todayInNairobi()}.csv`, this.reports.occupancyCsv(r))
      : ok(r);
  }
}
