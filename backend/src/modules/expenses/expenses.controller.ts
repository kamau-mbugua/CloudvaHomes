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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sendCsv } from '../../common/http/csv.js';
import { ok } from '../../common/http/response.js';
import { Public, RequireAnyPermission, RequirePermission } from '../auth/decorators.js';
import { JobsGuard } from '../jobs/job-auth.js';
import {
  CreateExpenseDto,
  CreateRecurringDto,
  ListExpensesQueryDto,
  ListRecurringQueryDto,
  UpdateExpenseDto,
  UpdateRecurringDto,
  VoidExpenseDto,
} from './expenses.dto.js';
import { ExpensesService } from './expenses.service.js';
import { sendFile } from '../files/uploads.controller.js';
import { UploadsService } from '../files/uploads.service.js';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller()
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly uploads: UploadsService,
  ) {}

  /** Paged JSON; `?format=csv` downloads every matching row. */
  @Get('expenses')
  @RequirePermission('expenses:view')
  async list(@Query() q: ListExpensesQueryDto, @Res({ passthrough: true }) res: Response) {
    if (q.format === 'csv') return sendCsv(res, 'expenses.csv', await this.expenses.csv(q));
    return this.expenses.list(q);
  }

  @Post('expenses')
  @RequirePermission('expenses:create')
  async create(@Body() dto: CreateExpenseDto) {
    return ok(await this.expenses.create(dto));
  }

  @Get('expenses/:id')
  @RequirePermission('expenses:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.expenses.get(id));
  }

  @Get('expenses/:id/receipt')
  @RequirePermission('expenses:view')
  async receipt(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { upload, data } = await this.uploads.content(await this.expenses.receiptUploadId(id));
    return sendFile(res, upload, data);
  }

  @Patch('expenses/:id')
  @RequirePermission('expenses:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto) {
    return ok(await this.expenses.update(id, dto));
  }

  @Post('expenses/:id/void')
  @HttpCode(200)
  @RequirePermission('expenses:delete')
  async void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidExpenseDto) {
    return ok(await this.expenses.void(id, dto));
  }

  @Get('recurring-expenses')
  @RequirePermission('expenses:view')
  async listRecurring(@Query() q: ListRecurringQueryDto) {
    return ok(await this.expenses.listRecurring(q));
  }

  @Post('recurring-expenses')
  @RequirePermission('expenses:create')
  async createRecurring(@Body() dto: CreateRecurringDto) {
    return ok(await this.expenses.createRecurring(dto));
  }

  /** Generates what is due now (the nightly job does this anyway). */
  @Post('recurring-expenses/run')
  @HttpCode(200)
  @RequirePermission('expenses:create')
  async run() {
    return ok(await this.expenses.runRecurring());
  }

  @Patch('recurring-expenses/:id')
  @RequirePermission('expenses:update')
  async updateRecurring(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRecurringDto) {
    return ok(await this.expenses.updateRecurring(id, dto));
  }

  @Delete('recurring-expenses/:id')
  @HttpCode(204)
  @RequireAnyPermission('expenses:delete')
  async removeRecurring(@Param('id', ParseUUIDPipe) id: string) {
    await this.expenses.removeRecurring(id);
  }
}

/** Cloud Scheduler, daily. */
@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class ExpenseJobsController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly uploads: UploadsService,
  ) {}

  @Post('recurring-expenses')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async recurring() {
    return { data: await this.expenses.runRecurringAll() };
  }

  @Post('upload-cleanup')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async cleanup() {
    return { data: await this.uploads.cleanup() };
  }
}
