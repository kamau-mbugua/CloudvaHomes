import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { FilesModule } from '../files/files.module.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { MpesaModule } from '../mpesa/mpesa.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { MessagesService } from './messages.service.js';
import { TenantAccountsService } from './tenant-accounts.service.js';
import {
  ReminderJobsController,
  TenantAccessController,
  TenantPortalController,
} from './tenant-portal.controller.js';
import { TenantPortalService } from './tenant-portal.service.js';

/** Tenant portal & reminders (phase 7). */
@Module({
  imports: [
    PortfolioModule,
    BillingModule,
    PaymentsModule,
    MpesaModule,
    FilesModule,
    MaintenanceModule,
  ],
  controllers: [TenantAccessController, TenantPortalController, ReminderJobsController],
  providers: [
    MessagesService,
    TenantAccountsService,
    TenantPortalService,
    JobTokenVerifier,
    JobsGuard,
  ],
})
export class TenantPortalModule {}
