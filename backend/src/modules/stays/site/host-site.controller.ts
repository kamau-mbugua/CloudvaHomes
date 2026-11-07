import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { MAX_PHOTO_UPLOAD_BYTES } from '../../files/uploads.service.js';
import { SlugCheckQueryDto, UpdateHostSiteDto } from './host-site.dto.js';
import { HostSiteService } from './host-site.service.js';

@ApiTags('Short Stays - Site')
@ApiBearerAuth()
@Controller('host/site')
export class HostSiteController {
  constructor(private readonly site: HostSiteService) {}

  @Get()
  @RequirePermission('site:view')
  async get() {
    return ok(await this.site.get());
  }

  @Get('slug-check')
  @RequirePermission('site:view')
  async checkSlug(@Query() q: SlugCheckQueryDto) {
    return ok(await this.site.checkSlug(q.slug));
  }

  @Patch()
  @RequirePermission('site:update')
  async update(@Body() dto: UpdateHostSiteDto) {
    return ok(await this.site.update(dto));
  }

  @Post('logo')
  @RequirePermission('site:update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES, files: 1 } }),
  )
  async uploadLogo(@UploadedFile() file?: { buffer: Buffer; size: number }) {
    return ok(await this.site.uploadLogo(file));
  }
}
