import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { buildLoggerOptions } from './common/logging/logger.options.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './modules/identity.module.js';
import { AgencyModule } from './modules/agency/agency.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { MaintenanceModule } from './modules/maintenance/maintenance.module.js';
import { BanksModule } from './modules/banks/banks.module.js';
import { MpesaModule } from './modules/mpesa/mpesa.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { TenantPortalModule } from './modules/tenant-portal/tenant-portal.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PortfolioModule } from './modules/portfolio/portfolio.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => buildLoggerOptions(env) }),
    PrismaModule,
    IdentityModule,
    PortfolioModule,
    BillingModule,
    PaymentsModule,
    MpesaModule,
    ExpensesModule,
    MaintenanceModule,
    ReportsModule,
    AgencyModule,
    TenantPortalModule,
    PlatformModule,
    BanksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
