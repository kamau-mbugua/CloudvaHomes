import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { renderInvoicePdf } from './invoice-pdf.js';
import { InvoiceRunService } from './invoice-run.service.js';
import {
  CreateAdhocInvoiceDto,
  CreateCreditNoteDto,
  ListInvoicesQueryDto,
  RunQueryDto,
  VoidInvoiceDto,
} from './invoices.dto.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller()
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly runs: InvoiceRunService,
  ) {}

  @Get('invoices')
  @RequirePermission('invoices:view')
  list(@Query() q: ListInvoicesQueryDto) {
    return this.invoices.list(q);
  }

  /** What the run would issue on `date` — nothing is written. */
  @Get('invoices/run/preview')
  @RequirePermission('invoices:view')
  async preview(@Query() q: RunQueryDto) {
    return ok(await this.runs.preview(q.date));
  }

  /** The monthly run for the active organisation, now. Safe to repeat. */
  @Post('invoices/run')
  @HttpCode(200)
  @RequirePermission('invoices:create')
  async run(@Body() dto: RunQueryDto) {
    return ok(await this.runs.run(dto.date));
  }

  @Post('invoices')
  @RequirePermission('invoices:create')
  async createAdhoc(@Body() dto: CreateAdhocInvoiceDto) {
    return ok(await this.invoices.createAdhoc(dto));
  }

  @Get('invoices/:id')
  @RequirePermission('invoices:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.invoices.get(id));
  }

  @Get('invoices/:id/pdf')
  @RequirePermission('invoices:view')
  @ApiProduces('application/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const data = await this.invoices.forPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${data.invoice.number}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(await renderInvoicePdf(data));
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  @RequirePermission('invoices:void')
  async void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidInvoiceDto) {
    return ok(await this.invoices.void(id, dto));
  }

  @Post('invoices/:id/credit-notes')
  @HttpCode(200)
  @RequirePermission('invoices:void')
  async creditNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCreditNoteDto) {
    return ok(await this.invoices.creditNote(id, dto));
  }

  @Post('tenancies/:id/move-in-invoice')
  @RequirePermission('invoices:create')
  async moveIn(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.invoices.createMoveIn(id));
  }
}
