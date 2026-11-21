import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { ok } from '../../common/http/response.js';
import type { Upload } from '../../generated/prisma/client.js';
import { RequireOrg } from '../auth/decorators.js';
import { photoWidth } from './photo-variants.js';
import { MAX_UPLOAD_BYTES, UploadsService } from './uploads.service.js';

class UploadBodyDto {
  @IsIn([
    'EXPENSE_RECEIPT',
    'METER_PHOTO',
    'MAINTENANCE_PHOTO',
    'LEASE_DOCUMENT',
    'INSPECTION_PHOTO',
    'LISTING_PHOTO',
    'SITE_LOGO',
  ])
  purpose!:
    | 'EXPENSE_RECEIPT'
    | 'METER_PHOTO'
    | 'MAINTENANCE_PHOTO'
    | 'LEASE_DOCUMENT'
    | 'INSPECTION_PHOTO'
    | 'LISTING_PHOTO'
    | 'SITE_LOGO';
}

/** Streams a stored file inline, never cached by shared caches. */
export function sendFile(res: Response, upload: Upload, data: Buffer) {
  res.setHeader('Content-Type', upload.contentType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(data);
}

@ApiTags('Files')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Multipart: `file` (JPEG, PNG, WebP or PDF, ≤ 10 MB) and `purpose`. Attach the returned id. */
  @Post()
  @RequireOrg()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: {
          enum: [
            'EXPENSE_RECEIPT',
            'METER_PHOTO',
            'MAINTENANCE_PHOTO',
            'LEASE_DOCUMENT',
            'INSPECTION_PHOTO',
            'LISTING_PHOTO',
            'SITE_LOGO',
          ],
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async create(
    @Body() body: UploadBodyDto,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    return ok(await this.uploads.create(body.purpose, file));
  }

  @Get(':id/content')
  @RequireOrg()
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('w') w: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // ?w=160|480|1024 → a smaller WebP copy of a listing photo or logo, for lists and thumbnails.
    // Only a copy we made ourselves is served this way (and may be cached); anything else — other
    // kinds of file, or a photo that couldn't be resized — goes out exactly as without ?w=.
    const width = photoWidth(w);
    if (width) {
      const variant = await this.uploads.contentVariant(id, width);
      if (variant.resized) {
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return new StreamableFile(variant.data);
      }
    }
    const { upload, data } = await this.uploads.content(id);
    return sendFile(res, upload, data);
  }
}
