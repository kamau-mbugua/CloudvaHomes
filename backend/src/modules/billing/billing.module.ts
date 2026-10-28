import { Module, type OnModuleInit } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { FilesModule } from '../files/files.module.js';
import { JobTokenVerifier, JobsGuard } from '../jobs/job-auth.js';
import { JobsController } from '../jobs/jobs.controller.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { TenanciesService } from '../portfolio/tenancies/tenancies.service.js';
import { ChargesController } from './charges/charges.controller.js';
import { ChargesService } from './charges/charges.service.js';
import { InvoiceBuilder } from './invoices/invoice-builder.js';
import { InvoiceIssuer } from './invoices/invoice-issuer.js';
import { InvoiceRunService } from './invoices/invoice-run.service.js';
import { InvoicesController } from './invoices/invoices.controller.js';
import { InvoicesService } from './invoices/invoices.service.js';
import { MetersController } from './meters/meters.controller.js';
import { MetersService } from './meters/meters.service.js';

/**
 * Billing (phase 3): charges, meters and readings, invoices, credit notes, the monthly run
 * and its scheduled job.
 */
@Module({
  imports: [PortfolioModule, FilesModule],
  controllers: [ChargesController, MetersController, InvoicesController, JobsController],
  providers: [
    ChargesService,
    MetersService,
    InvoiceBuilder,
    InvoiceIssuer,
    InvoicesService,
    InvoiceRunService,
    JobTokenVerifier,
    JobsGuard,
  ],
  exports: [InvoicesService, InvoiceIssuer],
})
export class BillingModule implements OnModuleInit {
  constructor(
    private readonly tenancies: TenanciesService,
    private readonly invoices: InvoicesService,
  ) {}

  /** Portfolio doesn't depend on billing; billing plugs the move-in invoice into move-in. */
  onModuleInit() {
    // `wanted`: true = issue (fail if impossible), false = don't, undefined = issue when the
    // property has move-in charges and the caller may invoice.
    this.tenancies.onMoveIn(async (tx, tenancy, wanted) => {
      if (wanted === false) return;
      const canInvoice = !!currentContext()?.permissions.has('invoices:create');
      if (wanted === true && !canInvoice) throw AppError.forbidden();
      if (canInvoice) await this.invoices.issueMoveInInTx(tx, tenancy, wanted === true);
    });
  }
}
