import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { ExpenseJobsController, ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';

/** Expenses (phase 6): one-off and recurring property expenses with receipts. */
@Module({
  imports: [PortfolioModule, FilesModule],
  controllers: [ExpensesController, ExpenseJobsController],
  providers: [ExpensesService, JobTokenVerifier, JobsGuard],
  exports: [ExpensesService],
})
export class ExpensesModule {}
