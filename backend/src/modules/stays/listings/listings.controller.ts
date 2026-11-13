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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { MAX_PHOTO_UPLOAD_BYTES } from '../../files/uploads.service.js';
import {
  CreateListingDto,
  ListListingsQueryDto,
  ReorderPhotosDto,
  ReplaceSpecialPricesDto,
  UpdateListingDto,
} from './listings.dto.js';
import { ListingsService } from './listings.service.js';

@ApiTags('Short Stays - Listings')
@ApiBearerAuth()
@Controller('host/listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @RequirePermission('listings:view')
  async list(@Query() q: ListListingsQueryDto) {
    return this.listings.list(q);
  }

  @Post()
  @RequirePermission('listings:create')
  async create(@Body() dto: CreateListingDto) {
    return ok(await this.listings.create(dto));
  }

  /** The Google Maps browser key for the location search in the listing editor (null = unset). */
  @Get('maps')
  @RequirePermission('listings:view')
  async maps() {
    return ok(await this.listings.mapsConfig());
  }

  @Get(':id')
  @RequirePermission('listings:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.listings.get(id));
  }

  @Patch(':id')
  @RequirePermission('listings:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateListingDto) {
    return ok(await this.listings.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('listings:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.listings.remove(id);
  }

  @Post(':id/photos')
  @RequirePermission('listings:update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES, files: 1 } }),
  )
  async addPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    return ok(await this.listings.addPhoto(id, file));
  }

  @Put(':id/photos/order')
  @RequirePermission('listings:update')
  async reorderPhotos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderPhotosDto) {
    return ok(await this.listings.reorderPhotos(id, dto));
  }

  @Delete(':id/photos/:photoId')
  @RequirePermission('listings:update')
  async deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return ok(await this.listings.deletePhoto(id, photoId));
  }

  @Put(':id/special-prices')
  @RequirePermission('listings:update')
  async replaceSpecialPrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceSpecialPricesDto,
  ) {
    return ok(await this.listings.replaceSpecialPrices(id, dto));
  }
}
