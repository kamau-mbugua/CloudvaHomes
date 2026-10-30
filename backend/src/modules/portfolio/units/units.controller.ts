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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sendCsv } from '../../../common/http/csv.js';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import {
  BulkCreateUnitsDto,
  CreateUnitDto,
  ImportUnitsCsvDto,
  ListUnitsQueryDto,
  UpdateUnitDto,
} from './units.dto.js';
import { UnitsService } from './units.service.js';

@ApiTags('Units')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @RequirePermission('units:view')
  list(@Query() q: ListUnitsQueryDto) {
    return this.units.list(q);
  }

  @Post()
  @RequirePermission('units:create')
  async create(@Body() dto: CreateUnitDto) {
    return ok(await this.units.create(dto));
  }

  /** Many units in one property with shared details. All or nothing. */
  @Post('bulk')
  @RequirePermission('units:create')
  async bulk(@Body() dto: BulkCreateUnitsDto) {
    return ok(await this.units.bulkCreate(dto));
  }

  @Get('import-template')
  @RequirePermission('units:view')
  importTemplate(@Res({ passthrough: true }) res: Response) {
    return sendCsv(res, 'units-import-template.csv', this.units.importTemplate());
  }

  @Post('import-csv')
  @HttpCode(200)
  @RequirePermission('units:create')
  async importCsv(@Body() dto: ImportUnitsCsvDto) {
    return ok(await this.units.importCsv(dto));
  }

  @Get(':id')
  @RequirePermission('units:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.units.get(id));
  }

  @Patch(':id')
  @RequirePermission('units:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return ok(await this.units.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('units:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.units.remove(id);
  }
}
