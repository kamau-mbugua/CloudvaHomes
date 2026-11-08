import { Module, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { DarajaClient, SimulatedDarajaClient } from '../mpesa/daraja.client.js';
import { MpesaModule } from '../mpesa/mpesa.module.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformBillingService } from './platform-billing.service.js';
import { PlatformHooksController } from './platform-hooks.controller.js';
import { PlatformPayService } from './platform-pay.service.js';
import { PlatformReportsService } from './platform-reports.service.js';
import { SmsController } from './sms.controller.js';
import { SmsAdminController } from './sms-admin.controller.js';
import { SmsSettingsService } from './sms-settings.service.js';
import { SmsPurchasesService } from './sms-purchases.service.js';
import {
  BillingController,
  PlatformController,
  PlatformJobsController,
  PublicLandingController,
} from './platform.controller.js';

/** KodiHub billing organisations (phase 8) and platform admin suite (phase 11). */
@Module({
  imports: [MpesaModule],
  controllers: [
    BillingController,
    PlatformController,
    PlatformJobsController,
    PlatformHooksController,
    PublicLandingController,
    SmsController,
    SmsAdminController,
  ],
  providers: [
    SmsPurchasesService,
    SmsSettingsService,
    PlatformBillingService,
    PlatformAdminService,
    PlatformPayService,
    PlatformReportsService,
    JobTokenVerifier,
    JobsGuard,
  ],
})
export class PlatformModule implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The simulator calls back in-process; chain KodiHub's own STK requests after the rent ones. */
  onModuleInit() {
    const client = this.moduleRef.get(DarajaClient, { strict: false });
    if (!(client instanceof SimulatedDarajaClient)) return;
    const prisma = this.moduleRef.get(PrismaService, { strict: false });
    const pay = this.moduleRef.get(PlatformPayService);
    const previous = client.onComplete;
    client.onComplete = async (checkoutRequestId, payload) => {
      await previous?.(checkoutRequestId, payload);
      const req = await prisma.platformStkRequest.findUnique({ where: { checkoutRequestId } });
      if (!req) return;
      const settings = await prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
      await pay.handleStkCallback(settings, payload);
    };
  }
}
