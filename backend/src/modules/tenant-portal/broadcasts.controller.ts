import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { ok } from '../../common/http/response.js';
import { RequirePermission } from '../auth/decorators.js';
import { BroadcastPreviewDto, CreateBroadcastDto } from './broadcasts.dto.js';
import { BroadcastsService } from './broadcasts.service.js';

/** Notices to tenants (phase 13). */
@ApiTags('Broadcasts')
@ApiBearerAuth()
@Controller('broadcasts')
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  /** Who would get it: tenants, and how many have email / the tenant app. */
  @Post('preview')
  @HttpCode(200)
  @RequirePermission('messages:send')
  async preview(@Body() dto: BroadcastPreviewDto) {
    return ok(await this.broadcasts.preview(dto.propertyIds));
  }

  /** Queues the notice; it is sent in the background (one per organisation a minute). */
  @Post()
  @HttpCode(202)
  @RequirePermission('messages:send')
  async create(@Body() dto: CreateBroadcastDto) {
    return ok(await this.broadcasts.create(dto));
  }

  @Get()
  @RequirePermission('tenants:view')
  list(@Query() q: PaginationQueryDto) {
    return this.broadcasts.list(q);
  }

  @Get(':id')
  @RequirePermission('tenants:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.broadcasts.get(id));
  }
}
