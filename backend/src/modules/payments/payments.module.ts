import { Module, type OnModuleInit } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { InvoiceIssuer } from '../billing/invoices/invoice-issuer.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { AccountsService } from './accounts.service.js';
import { ChannelsController } from './channels/channels.controller.js';
import { ChannelsService } from './channels/channels.service.js';
import { LedgerService } from './ledger.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

/**
 * Payments (phase 4): channels, manual payments, allocation, credit, reversals, deposits,
 * statements and receipts.
 */
@Module({
  imports: [PortfolioModule, BillingModule],
  controllers: [ChannelsController, PaymentsController],
  providers: [ChannelsService, LedgerService, PaymentsService, AccountsService],
  exports: [LedgerService, PaymentsService, ChannelsService, AccountsService],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private readonly issuer: InvoiceIssuer,
    private readonly ledger: LedgerService,
  ) {}

  /** Billing doesn't depend on payments: a new invoice uses up the tenant's credit here. */
  onModuleInit() {
    this.issuer.onIssued(async (tx, invoice) => {
      await this.ledger.lockTenant(tx, invoice.tenantId);
      await this.ledger.applyCredit(tx, {
        orgId: invoice.orgId,
        tenantId: invoice.tenantId,
        userId: invoice.createdById,
      });
    });
  }
}
