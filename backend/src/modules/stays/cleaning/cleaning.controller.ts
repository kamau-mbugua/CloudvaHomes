import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok, paginated } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { CompleteCleaningDto, CreateCleaningDto, ListCleaningQueryDto } from './cleaning.dto.js';
import { CleaningService } from './cleaning.service.js';

@ApiTags('Host — Cleaning')
@ApiBearerAuth()
@Controller('host/cleaning')
export class CleaningController {
  constructor(private readonly cleaning: CleaningService) {}

  @RequirePermission('cleaning:view')
  @Get()
  async list(@Query() q: ListCleaningQueryDto) {
    const { items, total } = await this.cleaning.list(q);
    return paginated(items, total, q);
  }

  @RequirePermission('cleaning:update')
  @Post()
  async create(@Body() dto: CreateCleaningDto) {
    return ok(await this.cleaning.create(dto));
  }

  @RequirePermission('cleaning:update')
  @Post(':id/done')
  @HttpCode(200)
  async markDone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteCleaningDto) {
    return ok(await this.cleaning.markDone(id, dto));
  }
}
