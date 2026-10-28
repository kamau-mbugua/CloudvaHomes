import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/http/response.js';
import { PlatformAdminOnly, RequirePermission } from '../auth/decorators.js';
import { CreateOrganizationDto, UpdateOrganizationDto } from './organizations.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('Organisation')
@ApiBearerAuth()
@Controller('organization')
export class OrganizationController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  @RequirePermission('settings:view')
  async get() {
    return ok(await this.orgs.current());
  }

  @Patch()
  @RequirePermission('settings:update')
  async update(@Body() dto: UpdateOrganizationDto) {
    return ok(await this.orgs.updateCurrent(dto));
  }
}

@ApiTags('Platform')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('platform/organizations')
export class PlatformOrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  async create(@Body() dto: CreateOrganizationDto) {
    return ok(await this.orgs.create(dto));
  }
}
