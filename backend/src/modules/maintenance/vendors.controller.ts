import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/http/response.js';
import { RequirePermission } from '../auth/decorators.js';
import { CreateVendorDto, ListVendorsQueryDto, UpdateVendorDto } from './maintenance.dto.js';
import { VendorsService } from './vendors.service.js';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @RequirePermission('maintenance:view')
  list(@Query() q: ListVendorsQueryDto) {
    return this.vendors.list(q);
  }

  @Post()
  @RequirePermission('maintenance:update')
  async create(@Body() dto: CreateVendorDto) {
    return ok(await this.vendors.create(dto));
  }

  @Patch(':id')
  @RequirePermission('maintenance:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorDto) {
    return ok(await this.vendors.update(id, dto));
  }
}
