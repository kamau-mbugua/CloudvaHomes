import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { MAX_UPLOAD_BYTES, UploadsService } from './uploads.service.js';

class UploadBodyDto {
  @IsIn(['EXPENSE_RECEIPT', 'METER_PHOTO', 'MAINTENANCE_PHOTO'])
  purpose!: 'EXPENSE_RECEIPT' | 'METER_PHOTO' | 'MAINTENANCE_PHOTO';
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
        purpose: { enum: ['EXPENSE_RECEIPT', 'METER_PHOTO', 'MAINTENANCE_PHOTO'] },
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
  async content(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { upload, data } = await this.uploads.content(id);
    return sendFile(res, upload, data);
  }
}
