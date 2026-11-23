import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { JobsGuard } from '../jobs/job-auth.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { Public } from './decorators.js';

export class AccountPurgeJobDto {
  /** Tests only: the moment to purge as of (defaults to now). */
  @IsOptional()
  @IsISO8601()
  now?: string;
}

/** Scheduled jobs for accounts. Not user-facing; not in the public API document. */
@ApiExcludeController()
@Public() // no user session: JobsGuard checks the scheduler's token instead
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class AccountJobsController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /** Daily 01:35 Nairobi: erases accounts deleted more than 30 days ago. Idempotent. */
  @Post('account-purge')
  @HttpCode(200)
  async purge(@Body() dto: AccountPurgeJobDto) {
    return { data: await this.deletion.purgeDeleted(dto.now ? new Date(dto.now) : undefined) };
  }
}
