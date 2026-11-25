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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../common/http/response.js';
import { Public, RequirePermission } from '../auth/decorators.js';
import { sendFile } from '../files/uploads.controller.js';
import { MAX_PHOTO_UPLOAD_BYTES } from '../files/uploads.service.js';
import {
  AssignVendorDto,
  ConvertMaintenanceToExpenseDto,
  CreateMaintenanceRequestDto,
  ListMaintenanceQueryDto,
  UpdateMaintenanceRequestDto,
  VendorCompleteJobDto,
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

  /** Phase 18: send the job to a vendor (texting them), or take it back. */
  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission('maintenance:update')
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignVendorDto) {
    return ok(await this.maintenance.assign(id, dto.vendorId, dto.notify ?? true));
  }

  /** Phase 19: get (or create) the vendor repair link for a maintenance request. */
  @Get(':id/vendor-link')
  @RequirePermission('maintenance:update')
  async vendorLink(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.maintenance.getVendorLink(id));
  }

  /** Phase 19: rotate the vendor repair link token, invalidating the old link. */
  @Post(':id/vendor-link/rotate')
  @HttpCode(200)
  @RequirePermission('maintenance:update')
  async rotateVendorLink(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.maintenance.rotateVendorLink(id));
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

@ApiTags('Public Vendor Jobs')
@Public()
@Controller('public/vendor-jobs')
export class PublicVendorJobsController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get(':token')
  async get(@Param('token') token: string) {
    return ok(await this.maintenance.getPublicJob(token));
  }

  @Get(':token/photos/:uploadId')
  async photo(
    @Param('token') token: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { upload, data } = await this.maintenance.publicJobPhotoContent(token, uploadId);
    return sendFile(res, upload, data);
  }

  @Post(':token/photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES } }))
  async uploadPhoto(
    @Param('token') token: string,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    return ok(await this.maintenance.uploadPublicJobPhoto(token, file));
  }

  @Post(':token/complete')
  @HttpCode(200)
  async complete(@Param('token') token: string, @Body() dto: VendorCompleteJobDto) {
    return ok(await this.maintenance.completePublicJob(token, dto));
  }
}
