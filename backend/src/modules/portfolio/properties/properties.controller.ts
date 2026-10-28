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
import { CreatePropertyDto, ListPropertiesQueryDto, UpdatePropertyDto } from './properties.dto.js';
import { PropertiesService } from './properties.service.js';

@ApiTags('Properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  @RequirePermission('properties:view')
  list(@Query() q: ListPropertiesQueryDto) {
    return this.properties.list(q);
  }

  @Post()
  @RequirePermission('properties:create')
  async create(@Body() dto: CreatePropertyDto) {
    return ok(await this.properties.create(dto));
  }

  @Get(':id')
  @RequirePermission('properties:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.properties.get(id));
  }

  @Patch(':id')
  @RequirePermission('properties:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePropertyDto) {
    return ok(await this.properties.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('properties:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.properties.remove(id);
  }
}
