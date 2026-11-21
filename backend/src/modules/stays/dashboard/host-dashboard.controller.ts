import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { HostDashboardQueryDto } from './host-dashboard.dto.js';
import { HostDashboardService } from './host-dashboard.service.js';

@ApiTags('Host — Dashboard')
@ApiBearerAuth()
@Controller('host/dashboard')
export class HostDashboardController {
  constructor(private readonly dashboard: HostDashboardService) {}

  /** Everything on the host's Dashboard (web) and Today tab (mobile), in one call. */
  @RequirePermission('bookings:view')
  @Get()
  async get(@Query() q: HostDashboardQueryDto) {
    return ok(await this.dashboard.get(q));
  }
}
