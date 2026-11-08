import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ok } from '../../../common/http/response.js';
import { Public } from '../../auth/decorators.js';
import { UploadsService } from '../../files/uploads.service.js';
import {
  PublicAvailabilityQueryDto,
  PublicAvailableUnitsQueryDto,
  PublicBookingCancelDto,
  PublicBookingPayDto,
  PublicCreateBookingDto,
  PublicQuoteDto,
  PublicVerifyPhoneDto,
} from './public-site.dto.js';
import { photoWidth } from '../../files/photo-variants.js';
import { PublicSiteService } from './public-site.service.js';
import { siteCsp } from './site-html.js';

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

@ApiTags('Public Stays Site')
@Public()
@Controller('public')
export class PublicSiteController {
  constructor(
    private readonly publicSite: PublicSiteService,
    private readonly uploads: UploadsService,
  ) {}

  @Get('sites/:slug')
  async getSite(@Param('slug') slug: string) {
    return ok(await this.publicSite.getSite(slug));
  }

  @Get('sites/:slug/listings/:id')
  async getListing(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.publicSite.getListing(slug, id));
  }

  @Get('sites/:slug/listings/:id/availability')
  async getAvailability(
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PublicAvailabilityQueryDto,
    @Req() req: Request,
  ) {
    return ok(await this.publicSite.getAvailability(slug, id, q, clientIp(req)));
  }

  @Get('sites/:slug/available')
  async getAvailable(
    @Param('slug') slug: string,
    @Query() q: PublicAvailableUnitsQueryDto,
    @Req() req: Request,
  ) {
    return ok(await this.publicSite.getAvailableListings(slug, q, clientIp(req)));
  }

  @Get('sites/:slug/legal/:doc')
  async getLegalPage(@Param('slug') slug: string, @Param('doc') doc: string, @Req() req: Request) {
    return ok(await this.publicSite.getLegalPage(slug, doc, clientIp(req)));
  }

  @Post('sites/:slug/listings/:id/quote')
  @HttpCode(200)
  async quote(
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublicQuoteDto,
    @Req() req: Request,
  ) {
    return ok(await this.publicSite.quote(slug, id, dto, clientIp(req)));
  }

  @Post('sites/:slug/verify')
  @HttpCode(202)
  async verify(
    @Param('slug') slug: string,
    @Body() dto: PublicVerifyPhoneDto,
    @Req() req: Request,
  ) {
    return ok(await this.publicSite.verifyPhone(slug, dto, clientIp(req)));
  }

  @Post('sites/:slug/bookings')
  async createBooking(
    @Param('slug') slug: string,
    @Body() dto: PublicCreateBookingDto,
    @Req() req: Request,
  ) {
    return ok(await this.publicSite.createBooking(slug, dto, clientIp(req)));
  }

  @Get('bookings/:token')
  async getBooking(@Param('token') token: string, @Req() req: Request) {
    return ok(await this.publicSite.getBookingByToken(token, clientIp(req)));
  }

  @Post('bookings/:token/pay')
  @HttpCode(200)
  async payBooking(
    @Param('token') token: string,
    @Body() dto: PublicBookingPayDto,
    @Req() req: Request,
  ) {
    return ok(await this.publicSite.payBookingByToken(token, dto, clientIp(req)));
  }

  @Post('bookings/:token/cancel/verify')
  @HttpCode(202)
  async verifyCancel(@Param('token') token: string, @Req() req: Request) {
    return ok(await this.publicSite.requestCancelCode(token, clientIp(req)));
  }

  @Post('bookings/:token/cancel')
  @HttpCode(200)
  async cancelBooking(
    @Param('token') token: string,
    @Body() dto: PublicBookingCancelDto,
    @Req() req: Request,
  ) {
    return ok(await this.publicSite.cancelBookingByToken(token, dto, clientIp(req)));
  }

  @Get('site-html')
  async getSiteHtml(
    @Query('host') host: string | undefined,
    @Query('path') path: string | undefined,
    @Res() res: Response,
  ) {
    const html = await this.publicSite.renderSiteHtml(host ?? '', path ?? '/');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', siteCsp(html));
    res.status(200).send(html);
  }

  @Get('photos/:uploadId')
  async getPhoto(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Query('w') w: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // ?w=160|480|1024 → a smaller WebP copy. Its URL never changes content (a new photo is a
    // new upload id), so browsers may keep it for a year.
    const width = photoWidth(w);
    if (width) {
      const variant = await this.uploads.publicPhotoVariant(uploadId, width);
      res.setHeader('Content-Type', variant.contentType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader(
        'Cache-Control',
        variant.resized ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return new StreamableFile(variant.data);
    }
    const { upload, data } = await this.uploads.publicPhotoContent(uploadId);
    res.setHeader('Content-Type', upload.contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(data);
  }
}
