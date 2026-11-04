import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppError } from '../../../common/errors/app-error.js';
import { ok } from '../../../common/http/response.js';
import type { InspectionKind } from '../../../generated/prisma/client.js';
import { RequirePermission } from '../../auth/decorators.js';
import { sendFile } from '../../files/uploads.controller.js';
import { SaveInspectionDto } from './inspections.dto.js';
import { InspectionsService } from './inspections.service.js';

export function inspectionKind(value: string): InspectionKind {
  if (value === 'MOVE_IN' || value === 'MOVE_OUT') return value;
  throw AppError.notFound('Inspection');
}

/** Move-in / move-out inspections of a tenancy (phase 13). */
@ApiTags('Tenancies')
@ApiBearerAuth()
@Controller('tenancies')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get(':id/inspections')
  @RequirePermission('tenancies:view')
  async list(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.inspections.list(id));
  }

  @Put(':id/inspections/:kind')
  @RequirePermission('tenancies:update')
  async save(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Body() dto: SaveInspectionDto,
  ) {
    return ok(await this.inspections.save(id, inspectionKind(kind), dto));
  }

  @Get(':id/inspections/:kind/pdf')
  @RequirePermission('tenancies:view')
  @ApiProduces('application/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const k = inspectionKind(kind);
    const data = await this.inspections.pdf(id, k);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${k === 'MOVE_IN' ? 'Move-in' : 'Move-out'}-inspection.pdf"`,
    );
    return res.send(data);
  }

  @Get(':id/inspections/:kind/photos/:uploadId')
  @RequirePermission('tenancies:view')
  async photo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { upload, data } = await this.inspections.photo(id, inspectionKind(kind), uploadId);
    return sendFile(res, upload, data);
  }
}
