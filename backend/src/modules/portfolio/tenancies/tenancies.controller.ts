import { RentChangesService } from './rent-changes.service.js';
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
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { sendFile } from '../../files/uploads.controller.js';
import { renderLeasePdf } from './lease-pdf.js';
import {
  AttachLeaseDocumentDto,
  CreateTenancyDto,
  ListTenanciesQueryDto,
  MoveOutDto,
  NoticeDto,
  RenewTenancyDto,
  RentChangeDto,
  UpdateTenancyDto,
} from './tenancies.dto.js';
import { TenanciesService } from './tenancies.service.js';

@ApiTags('Tenancies')
@ApiBearerAuth()
@Controller('tenancies')
export class TenanciesController {
  constructor(
    private readonly tenancies: TenanciesService,
    private readonly rentChanges: RentChangesService,
  ) {}

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

  @Get(':id/lease/pdf')
  @RequirePermission('tenancies:view')
  @ApiProduces('application/pdf')
  async leasePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.tenancies.forLeasePdf(id);
    const filename = `Lease-${data.tenancy.unit.property.code}-${data.tenancy.unit.number}.pdf`;
    const pdfBytes = await renderLeasePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(pdfBytes);
  }

  @Post(':id/lease-document')
  @HttpCode(200)
  @RequirePermission('tenancies:update')
  async attachLeaseDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachLeaseDocumentDto,
  ) {
    return ok(await this.tenancies.attachLeaseDocument(id, dto));
  }

  @Get(':id/lease-document')
  @RequirePermission('tenancies:view')
  async leaseDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { upload, data } = await this.tenancies.leaseDocument(id);
    return sendFile(res, upload, data);
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

  /** Schedule a new rent from a month not yet invoiced (phase 13). */
  @Post(':id/rent-changes')
  @RequirePermission('tenancies:update')
  async scheduleRentChange(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RentChangeDto) {
    return ok(await this.rentChanges.schedule(id, dto));
  }

  @Delete(':id/rent-changes/:changeId')
  @HttpCode(204)
  @RequirePermission('tenancies:update')
  async cancelRentChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('changeId', ParseUUIDPipe) changeId: string,
  ) {
    await this.rentChanges.cancel(id, changeId);
  }

  /** A later lease end date, optionally with a new rent (phase 13). */
  @Post(':id/renew')
  @HttpCode(200)
  @RequirePermission('tenancies:update')
  async renew(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenewTenancyDto) {
    return ok(await this.rentChanges.renew(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tenancies:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tenancies.remove(id);
  }
}
