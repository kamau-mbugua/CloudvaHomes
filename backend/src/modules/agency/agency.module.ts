import { Module, type OnModuleInit } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { InvoiceIssuer } from '../billing/invoices/invoice-issuer.js';
import { InvoicesService } from '../billing/invoices/invoices.service.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { LedgerService } from '../payments/ledger.service.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { AgencyController, AgencyJobsController, OwnerController } from './agency.controller.js';
import { AgreementsService } from './agreements.service.js';
import { LandlordAdminService } from './landlord-admin.service.js';
import { LandlordLedgerService } from './landlord-ledger.service.js';
import { OwnerService } from './owner.service.js';
import { RemittancesService } from './remittances.service.js';
import { StatementsService } from './statements.service.js';

/**
 * Agency accounting (phase 6b): agreements, landlord ledgers, owner statements, remittances
 * and the owner portal. It listens to payments, billing and expenses through their hooks, so
 * none of them depends on it.
 */
@Module({
  imports: [BillingModule, PaymentsModule, ExpensesModule, ReportsModule],
  controllers: [AgencyController, OwnerController, AgencyJobsController],
  providers: [
    AgreementsService,
    LandlordLedgerService,
    LandlordAdminService,
    StatementsService,
    RemittancesService,
    OwnerService,
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
  ) {}

  onModuleInit() {
    this.ledger.onAllocated((tx, e) => this.landlordLedger.onAllocated(tx, e));
    this.ledger.onDepositMoved((tx, e) => this.landlordLedger.onDepositMoved(tx, e));
    this.issuer.onIssued((tx, i) => this.landlordLedger.onIssued(tx, i.id, 1n, i.createdById));
    this.invoices.onVoided((tx, i) => this.landlordLedger.onIssued(tx, i.id, -1n, null));
    this.expenses.onChanged((tx, c) => this.landlordLedger.onExpenseChanged(tx, c));
  }
}
