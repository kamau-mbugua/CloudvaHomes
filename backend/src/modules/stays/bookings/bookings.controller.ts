import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../auth/decorators.js';
import {
  CalendarQueryDto,
  CancelBookingDto,
  CreateBlockDto,
  CreateHostBookingDto,
  DeclineBookingDto,
  ListBookingsQueryDto,
  QuoteBookingDto,
} from './bookings.dto.js';
import { BookingsService } from './bookings.service.js';

@ApiTags('host-bookings')
@ApiBearerAuth()
@Controller('host')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('bookings')
  @RequirePermission('bookings:view')
  list(@Query() query: ListBookingsQueryDto) {
    return this.bookings.list(query);
  }

  @Get('bookings/calendar')
  @RequirePermission('bookings:view')
  async calendar(@Query() query: CalendarQueryDto) {
    return { data: await this.bookings.calendar(query) };
  }

  /** Prices a new stay — for people who can make bookings (caretakers can't see prices). */
  @Post('bookings/quote')
  @RequirePermission('bookings:create')
  async quote(@Body() dto: QuoteBookingDto) {
    return {
      data: await this.bookings.quoteForApi(dto.listingId, dto.checkIn, dto.checkOut, dto.guests),
    };
  }

  @Post('bookings')
  @RequirePermission('bookings:create')
  async create(@Body() dto: CreateHostBookingDto) {
    return { data: await this.bookings.createByHost(dto) };
  }

  @Get('bookings/:id')
  @RequirePermission('bookings:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.bookings.get(id) };
  }

  @Post('bookings/:id/accept')
  @HttpCode(200)
  @RequirePermission('bookings:update')
  async accept(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.bookings.accept(id) };
  }

  @Post('bookings/:id/decline')
  @HttpCode(200)
  @RequirePermission('bookings:update')
  async decline(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclineBookingDto) {
    return { data: await this.bookings.decline(id, dto.reason) };
  }

  @Post('bookings/:id/check-in')
  @HttpCode(200)
  @RequirePermission('bookings:update')
  async checkIn(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.bookings.checkIn(id) };
  }

  @Post('bookings/:id/check-out')
  @HttpCode(200)
  @RequirePermission('bookings:update')
  async checkOut(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.bookings.checkOut(id) };
  }

  @Post('bookings/:id/no-show')
  @HttpCode(200)
  @RequirePermission('bookings:update')
  async noShow(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.bookings.noShow(id) };
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @RequirePermission('bookings:cancel')
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    return { data: await this.bookings.cancel(id, dto) };
  }

  @Post('blocks')
  @RequirePermission('bookings:create')
  async block(@Body() dto: CreateBlockDto) {
    return { data: await this.bookings.block(dto) };
  }

  @Delete('blocks/:id')
  @HttpCode(200)
  @RequirePermission('bookings:update')
  async unblock(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.bookings.unblock(id) };
  }
}
