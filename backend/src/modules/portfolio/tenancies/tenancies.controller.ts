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
import {
  CreateTenancyDto,
  ListTenanciesQueryDto,
  MoveOutDto,
  NoticeDto,
  UpdateTenancyDto,
} from './tenancies.dto.js';
import { TenanciesService } from './tenancies.service.js';

@ApiTags('Tenancies')
@ApiBearerAuth()
@Controller('tenancies')
export class TenanciesController {
  constructor(private readonly tenancies: TenanciesService) {}

  @Get()
  @RequirePermission('tenancies:view')
  list(@Query() q: ListTenanciesQueryDto) {
    return this.tenancies.list(q);
  }

  /** Move-in. Registering a new tenant in the same call also needs `tenants:create`. */
  @Post()
  @RequirePermission('tenancies:create')
  async moveIn(@Body() dto: CreateTenancyDto) {
    return ok(await this.tenancies.moveIn(dto));
  }

  @Get(':id')
  @RequirePermission('tenancies:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.tenancies.get(id));
  }

  @Patch(':id')
  @RequirePermission('tenancies:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenancyDto) {
    return ok(await this.tenancies.update(id, dto));
  }

  @Post(':id/notice')
  @HttpCode(200)
  @RequirePermission('tenancies:update')
  async notice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NoticeDto) {
    return ok(await this.tenancies.giveNotice(id, dto));
  }

  @Delete(':id/notice')
  @RequirePermission('tenancies:update')
  async withdrawNotice(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.tenancies.withdrawNotice(id));
  }

  @Post(':id/move-out')
  @HttpCode(200)
  @RequirePermission('tenancies:update')
  async moveOut(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveOutDto) {
    return ok(await this.tenancies.moveOut(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tenancies:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tenancies.remove(id);
  }
}
