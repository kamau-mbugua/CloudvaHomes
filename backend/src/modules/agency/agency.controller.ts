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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../common/http/response.js';
import { orgContext, Public, RequirePermission } from '../auth/decorators.js';
import { JobsGuard } from '../jobs/job-auth.js';
import {
  AdjustmentDto,
  CancelRemittanceDto,
  CreateAgreementDto,
  DraftRemittanceDto,
  LedgerQueryDto,
  ListAgreementsQueryDto,
  ListRemittancesQueryDto,
  PayoutDto,
  PayRemittanceDto,
  StatementRangeDto,
  UpdateAgreementDto,
} from './agency.dto.js';
import { AgreementsService } from './agreements.service.js';
import { LandlordAdminService } from './landlord-admin.service.js';
import { LandlordLedgerService } from './landlord-ledger.service.js';
import { OwnerService } from './owner.service.js';
import { RemittancesService } from './remittances.service.js';
import { renderOwnerStatementPdf } from './statement-pdf.js';
import { StatementsService } from './statements.service.js';

function pdf(res: Response, filename: string, data: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(data);
}

@ApiTags('Agency accounting')
@ApiBearerAuth()
@Controller()
export class AgencyController {
  constructor(
    private readonly agreements: AgreementsService,
    private readonly ledger: LandlordLedgerService,
    private readonly admin: LandlordAdminService,
    private readonly statements: StatementsService,
    private readonly remittances: RemittancesService,
  ) {}

  @Get('agreements')
  @RequirePermission('agreements:view')
  async listAgreements(@Query() q: ListAgreementsQueryDto) {
    return ok(await this.agreements.list(q));
  }

  @Post('agreements')
  @RequirePermission('agreements:create')
  async createAgreement(@Body() dto: CreateAgreementDto) {
    return ok(await this.agreements.create(dto));
  }

  @Patch('agreements/:id')
  @RequirePermission('agreements:update')
  async updateAgreement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAgreementDto) {
    return ok(await this.agreements.update(id, dto));
  }

  @Delete('agreements/:id')
  @HttpCode(204)
  @RequirePermission('agreements:delete')
  async removeAgreement(@Param('id', ParseUUIDPipe) id: string) {
    await this.agreements.remove(id);
  }

  /** Balances, payout details (masked) and portal access for a landlord. */
  @Get('landlords/:id/account')
  @RequirePermission('landlords:view')
  async account(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.admin.summary(id));
  }

  @Get('landlords/:id/ledger')
  @RequirePermission('landlords:view')
  ledgerList(@Param('id', ParseUUIDPipe) id: string, @Query() q: LedgerQueryDto) {
    return this.ledger.list(id, q);
  }

  /** Opening balances and corrections. Needs a fresh one-time code. */
  @Post('landlords/:id/ledger/adjustments')
  @RequirePermission('remittances:approve')
  async adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustmentDto) {
    return ok(await this.ledger.adjust(id, dto));
  }

  /** Needs a fresh one-time code; the landlord is told. */
  @Put('landlords/:id/payout')
  @RequirePermission('landlords:update')
  async setPayout(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayoutDto) {
    return ok(await this.admin.setPayout(id, dto));
  }

  @Delete('landlords/:id/payout')
  @RequirePermission('landlords:update')
  async removePayout(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.admin.removePayout(id));
  }

  @Post('landlords/:id/portal-access')
  @HttpCode(200)
  @RequirePermission('landlords:update')
  async grantPortal(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.admin.grantPortal(id));
  }

  @Delete('landlords/:id/portal-access')
  @RequirePermission('landlords:update')
  async revokePortal(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.admin.revokePortal(id));
  }

  @Get('landlords/:id/statement')
  @RequirePermission('landlords:view')
  async statement(@Param('id', ParseUUIDPipe) id: string, @Query() q: StatementRangeDto) {
    return ok(await this.statements.statement(id, q));
  }

  @Get('landlords/:id/statement/pdf')
  @RequirePermission('landlords:view')
  @ApiProduces('application/pdf')
  async statementPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: StatementRangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.statements.statement(id, q);
    return pdf(
      res,
      `statement-${s.landlord.code}-${s.from}-to-${s.to}.pdf`,
      await renderOwnerStatementPdf(s),
    );
  }

  @Get('remittances')
  @RequirePermission('remittances:view')
  listRemittances(@Query() q: ListRemittancesQueryDto) {
    return this.remittances.list(q);
  }

  @Post('remittances')
  @RequirePermission('remittances:create')
  async draft(@Body() dto: DraftRemittanceDto) {
    return ok(await this.remittances.draft(dto.landlordId, dto.period, orgContext().userId));
  }

  @Get('remittances/:id')
  @RequirePermission('remittances:view')
  async getRemittance(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.remittances.get(id));
  }

  @Post('remittances/:id/approve')
  @HttpCode(200)
  @RequirePermission('remittances:approve')
  async approve(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.remittances.approve(id));
  }

  @Post('remittances/:id/pay')
  @HttpCode(200)
  @RequirePermission('remittances:pay')
  async pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayRemittanceDto) {
    return ok(await this.remittances.pay(id, dto));
  }

  @Post('remittances/:id/cancel')
  @HttpCode(200)
  @RequirePermission('remittances:create')
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelRemittanceDto) {
    return ok(await this.remittances.cancel(id, dto));
  }
}

/** Read-only owner portal: any signed-in user, limited to the landlords linked to them. */
@ApiTags('Owner portal')
@ApiBearerAuth()
@Controller('owner/landlords')
export class OwnerController {
  constructor(
    private readonly owner: OwnerService,
    private readonly admin: LandlordAdminService,
    private readonly statements: StatementsService,
    private readonly remittances: RemittancesService,
  ) {}

  @Get()
  async mine() {
    return ok(await this.owner.mine());
  }

  @Get(':id')
  async overview(@Param('id', ParseUUIDPipe) id: string) {
    return ok(
      await this.owner.as(id, async () => {
        const account = await this.admin.summary(id);
        const month = await this.statements.statement(id, {});
        return {
          landlord: month.landlord,
          organization: {
            name: month.organization.name,
            phone: month.organization.phone,
            email: month.organization.email,
          },
          balances: account.balances,
          payout: account.payout
            ? { method: account.payout.method, masked: account.payout.masked }
            : null,
          occupancy: month.occupancy,
          arrears: month.arrears,
        };
      }),
    );
  }

  @Get(':id/statement')
  async statement(@Param('id', ParseUUIDPipe) id: string, @Query() q: StatementRangeDto) {
    return ok(await this.owner.as(id, () => this.statements.statement(id, q)));
  }

  @Get(':id/statement/pdf')
  @ApiProduces('application/pdf')
  async statementPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: StatementRangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.owner.as(id, () => this.statements.statement(id, q));
    return pdf(
      res,
      `statement-${s.landlord.code}-${s.from}-to-${s.to}.pdf`,
      await renderOwnerStatementPdf(s),
    );
  }

  @Get(':id/remittances')
  async remittancesList(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ListRemittancesQueryDto,
  ) {
    return this.owner.as(id, () =>
      this.remittances.list({
        page: q.page,
        pageSize: q.pageSize,
        status: q.status,
        period: q.period,
        landlordId: id,
      }),
    );
  }
}

/** Cloud Scheduler, daily. */
@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class AgencyJobsController {
  constructor(private readonly remittances: RemittancesService) {}

  @Post('remittance-drafts')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async drafts() {
    return { data: await this.remittances.draftDueAll() };
  }
}
