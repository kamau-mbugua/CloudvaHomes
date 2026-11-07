import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../auth/decorators.js';
import { JobsGuard } from '../../jobs/job-auth.js';
import { BookingsService } from '../bookings/bookings.service.js';

export class StaysExpiryJobDto {
  @IsOptional()
  @IsString()
  now?: string;
}

export class StaysDailyJobDto {
  @IsOptional()
  @IsString()
  today?: string;
}

@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class StaysJobsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('stays-expiry')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async expiry(@Body() body?: StaysExpiryJobDto) {
    const now = body?.now ? new Date(body.now) : new Date();
    return { data: await this.bookings.expireAll(now) };
  }

  @Post('stays-daily')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async daily(@Body() body?: StaysDailyJobDto) {
    return { data: await this.bookings.dailyAll(body?.today) };
  }
}
