import { Module, type OnModuleInit } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { InvoiceIssuer } from '../billing/invoices/invoice-issuer.js';
import { InvoicesService } from '../billing/invoices/invoices.service.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { DarajaClient, SimulatedDarajaClient } from '../mpesa/daraja.client.js';
import { MpesaModule } from '../mpesa/mpesa.module.js';
import { LedgerService } from '../payments/ledger.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { AgencyController, AgencyJobsController, OwnerController } from './agency.controller.js';
import { AgreementsService } from './agreements.service.js';
import { LandlordAdminService } from './landlord-admin.service.js';
import { LandlordLedgerService } from './landlord-ledger.service.js';
import { OwnerService } from './owner.service.js';
import {
  PayoutHooksController,
  PayoutJobsController,
  PayoutsController,
} from './payouts.controller.js';
import { PayoutsService } from './payouts.service.js';
import { RemittancesService } from './remittances.service.js';
import { StatementsService } from './statements.service.js';

/**
 * Agency accounting (phase 6b): agreements, landlord ledgers, owner statements, remittances
 * and the owner portal. It listens to payments, billing and expenses through their hooks, so
 * none of them depends on it.
 */
@Module({
  imports: [BillingModule, PaymentsModule, ExpensesModule, ReportsModule, MpesaModule],
  // PayoutsController first: its /remittances/bulk-file must win over /remittances/:id.
  controllers: [
    PayoutsController,
    AgencyController,
    OwnerController,
    AgencyJobsController,
    PayoutHooksController,
    PayoutJobsController,
  ],
  providers: [
    AgreementsService,
    LandlordLedgerService,
    LandlordAdminService,
    StatementsService,
    RemittancesService,
    OwnerService,
    PayoutsService,
    JobTokenVerifier,
    JobsGuard,
  ],
})
export class AgencyModule implements OnModuleInit {
  constructor(
    private readonly ledger: LedgerService,
    private readonly issuer: InvoiceIssuer,
    private readonly invoices: InvoicesService,
    private readonly expenses: ExpensesService,
    private readonly landlordLedger: LandlordLedgerService,
    private readonly daraja: DarajaClient,
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
  ) {}

  onModuleInit() {
    this.ledger.onAllocated((tx, e) => this.landlordLedger.onAllocated(tx, e));
    this.ledger.onDepositMoved((tx, e) => this.landlordLedger.onDepositMoved(tx, e));
    this.issuer.onIssued((tx, i) => this.landlordLedger.onIssued(tx, i.id, 1n, i.createdById));
    this.invoices.onVoided((tx, i) => this.landlordLedger.onIssued(tx, i.id, -1n, null));
    this.expenses.onChanged((tx, c) => this.landlordLedger.onExpenseChanged(tx, c));
    // The simulator "posts" B2C results in-process, the way Safaricom would over HTTP.
    if (this.daraja instanceof SimulatedDarajaClient) {
      this.daraja.onB2cResult = async (payload) => {
        const id = (payload as { Result?: { OriginatorConversationID?: string } }).Result
          ?.OriginatorConversationID;
        const p = id
          ? await this.prisma.payout.findUnique({
              where: { originatorConversationId: id },
              include: { account: { select: { callbackToken: true } } },
            })
          : null;
        if (p) await this.payouts.handleResult(p.account.callbackToken, payload);
      };
    }
  }
}
