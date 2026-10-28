import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators.js';
import { RunQueryDto } from '../billing/invoices/invoices.dto.js';
import { InvoiceRunService } from '../billing/invoices/invoice-run.service.js';
import { JobsGuard } from './job-auth.js';

/** Endpoints for Cloud Scheduler. Not user-facing; not in the public API document. */
@ApiExcludeController()
@Public() // no user session — JobsGuard checks the scheduler's OIDC token instead
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class JobsController {
  constructor(private readonly runs: InvoiceRunService) {}

  /** Daily 00:30 Nairobi. Idempotent, so retries and double fires are harmless. */
  @Post('invoice-run')
  @HttpCode(200)
  async invoiceRun(@Body() dto: RunQueryDto) {
    return { data: await this.runs.runAll(dto.date) };
  }
}
