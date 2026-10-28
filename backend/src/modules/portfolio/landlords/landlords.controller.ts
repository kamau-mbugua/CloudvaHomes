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
import { CreateLandlordDto, ListLandlordsQueryDto, UpdateLandlordDto } from './landlords.dto.js';
import { LandlordsService } from './landlords.service.js';

@ApiTags('Landlords')
@ApiBearerAuth()
@Controller('landlords')
export class LandlordsController {
  constructor(private readonly landlords: LandlordsService) {}

  @Get()
  @RequirePermission('landlords:view')
  list(@Query() q: ListLandlordsQueryDto) {
    return this.landlords.list(q);
  }

  @Post()
  @RequirePermission('landlords:create')
  async create(@Body() dto: CreateLandlordDto) {
    return ok(await this.landlords.create(dto));
  }

  @Get(':id')
  @RequirePermission('landlords:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.landlords.get(id));
  }

  /** The full ID number. Every call is written to the audit log. */
  @Get(':id/id-number')
  @RequirePermission('landlords:view')
  async idNumber(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.landlords.revealIdNumber(id));
  }

  @Patch(':id')
  @RequirePermission('landlords:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLandlordDto) {
    return ok(await this.landlords.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('landlords:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.landlords.remove(id);
  }
}
