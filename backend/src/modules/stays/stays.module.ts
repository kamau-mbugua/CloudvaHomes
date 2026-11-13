import { forwardRef, Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { MpesaModule } from '../mpesa/mpesa.module.js';
import { IdNumbers } from '../portfolio/id-numbers.js';
import { BookingsController } from './bookings/bookings.controller.js';
import { BookingsService } from './bookings/bookings.service.js';
import { CleaningController } from './cleaning/cleaning.controller.js';
import { CleaningService } from './cleaning/cleaning.service.js';
import { GuestsController } from './guests/guests.controller.js';
import { GuestsService } from './guests/guests.service.js';
import { StaysJobsController } from './jobs/stays-jobs.controller.js';
import { ListingsController } from './listings/listings.controller.js';
import { ListingsService } from './listings/listings.service.js';
import { GuestNoticesService } from './notices/guest-notices.service.js';
import {
  StayPaymentsController,
  StayReceiptsController,
} from './payments/stay-payments.controller.js';
import { StayPaymentsService } from './payments/stay-payments.service.js';
import { PublicSiteController } from './public/public-site.controller.js';
import { PublicSiteService } from './public/public-site.service.js';
import { HostReportsController } from './reports/host-reports.controller.js';
import { HostReportsService } from './reports/host-reports.service.js';
import { HostSiteController } from './site/host-site.controller.js';
import { HostSiteService } from './site/host-site.service.js';

@Module({
  imports: [FilesModule, forwardRef(() => MpesaModule)],
  controllers: [
    HostSiteController,
    ListingsController,
    BookingsController,
    StayPaymentsController,
    StayReceiptsController,
    PublicSiteController,
    StaysJobsController,
    HostReportsController,
    GuestsController,
    CleaningController,
  ],
  providers: [
    IdNumbers,
    GuestNoticesService,
    HostSiteService,
    ListingsService,
    BookingsService,
    StayPaymentsService,
    PublicSiteService,
    HostReportsService,
    GuestsService,
    CleaningService,
    JobTokenVerifier,
    JobsGuard,
  ],
  exports: [
    GuestNoticesService,
    HostSiteService,
    ListingsService,
    BookingsService,
    StayPaymentsService,
    PublicSiteService,
  ],
})
export class StaysModule {}
