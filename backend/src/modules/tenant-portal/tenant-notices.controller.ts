import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantNoticesQueryDto } from './tenant-portal.dto.js';
import { TenantPortalService } from './tenant-portal.service.js';

/** The tenant's own notices (tenant portal redesign): any signed-in user, only their own. */
@ApiTags('Tenant portal')
@ApiBearerAuth()
@Controller('tenant/notices')
export class TenantNoticesController {
  constructor(private readonly portal: TenantPortalService) {}

  @Get()
  list(@Query() q: TenantNoticesQueryDto) {
    return this.portal.notices(q);
  }
}
