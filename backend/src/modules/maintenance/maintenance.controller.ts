import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../common/http/response.js';
import { RequirePermission } from '../auth/decorators.js';
import { sendFile } from '../files/uploads.controller.js';
import {
  ConvertMaintenanceToExpenseDto,
  CreateMaintenanceRequestDto,
  ListMaintenanceQueryDto,
  UpdateMaintenanceRequestDto,
} from './maintenance.dto.js';
import { MaintenanceService } from './maintenance.service.js';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller('maintenance-requests')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  @RequirePermission('maintenance:view')
  list(@Query() q: ListMaintenanceQueryDto) {
    return this.maintenance.list(q);
  }

  @Get(':id')
  @RequirePermission('maintenance:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.maintenance.get(id));
  }

  @Post()
  @RequirePermission('maintenance:create')
  async create(@Body() dto: CreateMaintenanceRequestDto) {
    return ok(await this.maintenance.createForStaff(dto));
  }

  @Patch(':id')
  @RequirePermission('maintenance:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaintenanceRequestDto) {
    return ok(await this.maintenance.update(id, dto));
  }

  @Post(':id/expense')
  @HttpCode(200)
  @RequirePermission('expenses:create')
  async convertToExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertMaintenanceToExpenseDto,
  ) {
    return ok(await this.maintenance.convertToExpense(id, dto));
  }

  @Get(':id/photos/:uploadId')
  @RequirePermission('maintenance:view')
  async photo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { upload, data } = await this.maintenance.photoContent(id, uploadId);
    return sendFile(res, upload, data);
  }
}
