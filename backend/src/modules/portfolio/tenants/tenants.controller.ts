import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { CreateTenantDto, ListTenantsQueryDto, UpdateTenantDto } from './tenants.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RequirePermission('tenants:view')
  list(@Query() q: ListTenantsQueryDto) {
    return this.tenants.list(q);
  }

  @Post()
  @RequirePermission('tenants:create')
  async create(@Body() dto: CreateTenantDto) {
    return ok(await this.tenants.create(dto));
  }

  @Get(':id')
  @RequirePermission('tenants:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.tenants.get(id));
  }

  /** The full ID number. Every call is written to the audit log. */
  @Get(':id/id-number')
  @RequirePermission('tenants:view')
  async idNumber(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.tenants.revealIdNumber(id));
  }

  @Patch(':id')
  @RequirePermission('tenants:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) {
    return ok(await this.tenants.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tenants:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tenants.remove(id);
  }
}
