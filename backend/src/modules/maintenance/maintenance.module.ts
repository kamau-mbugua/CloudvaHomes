import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { FilesModule } from '../files/files.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { MaintenanceController } from './maintenance.controller.js';
import { MaintenanceService } from './maintenance.service.js';
import { VendorsController } from './vendors.controller.js';
import { VendorsService } from './vendors.service.js';

@Module({
  imports: [PortfolioModule, FilesModule, ExpensesModule],
  controllers: [MaintenanceController, VendorsController],
  providers: [MaintenanceService, VendorsService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
