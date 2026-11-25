import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { FilesModule } from '../files/files.module.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { MaintenanceController, PublicVendorJobsController } from './maintenance.controller.js';
import { MaintenanceService } from './maintenance.service.js';
import { TaskPushesController } from './task-pushes.controller.js';
import { TaskPushesService } from './task-pushes.service.js';
import { VendorsController } from './vendors.controller.js';
import { VendorsService } from './vendors.service.js';

@Module({
  imports: [PortfolioModule, FilesModule, ExpensesModule],
  controllers: [
    MaintenanceController,
    PublicVendorJobsController,
    VendorsController,
    TaskPushesController,
  ],
  providers: [MaintenanceService, VendorsService, TaskPushesService, JobTokenVerifier, JobsGuard],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
