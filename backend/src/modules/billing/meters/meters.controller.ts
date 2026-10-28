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
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { sendFile } from '../../files/uploads.controller.js';
import { UploadsService } from '../../files/uploads.service.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import {
  CreateMeterDto,
  ListMetersQueryDto,
  ReadingSheetQueryDto,
  SaveReadingsDto,
  UpdateMeterDto,
} from './meters.dto.js';
import { MetersService } from './meters.service.js';

@ApiTags('Meters')
@ApiBearerAuth()
@Controller()
export class MetersController {
  constructor(
    private readonly meters: MetersService,
    private readonly uploads: UploadsService,
  ) {}

  @Get('meters')
  @RequirePermission('meters:view')
  async list(@Query() q: ListMetersQueryDto) {
    return ok(await this.meters.list(q));
  }

  @Post('meters')
  @RequirePermission('meters:create')
  async create(@Body() dto: CreateMeterDto) {
    return ok(await this.meters.create(dto));
  }

  @Patch('meters/:id')
  @RequirePermission('meters:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMeterDto) {
    return ok(await this.meters.update(id, dto));
  }

  @Delete('meters/:id')
  @HttpCode(204)
  @RequirePermission('meters:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.meters.remove(id);
  }

  /** The month's reading sheet for one metered charge of a property. */
  @Get('meter-readings/sheet')
  @RequirePermission('meters:view')
  async sheet(@Query() q: ReadingSheetQueryDto) {
    return ok(await this.meters.sheet(q));
  }

  @Put('meter-readings')
  @RequirePermission('meters:create')
  async save(@Body() dto: SaveReadingsDto) {
    return ok(await this.meters.save(dto));
  }

  @Get('meter-readings/:id/photo')
  @RequirePermission('meters:view')
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { upload, data } = await this.uploads.content(await this.meters.photoUploadId(id));
    return sendFile(res, upload, data);
  }

  @Delete('meter-readings/:id')
  @HttpCode(204)
  @RequirePermission('meters:delete')
  async removeReading(@Param('id', ParseUUIDPipe) id: string) {
    await this.meters.removeReading(id);
  }
}
