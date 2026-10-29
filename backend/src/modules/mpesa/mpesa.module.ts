import { Module, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { emptyContext, runWithContext } from '../../common/context/request-context.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JobsGuard, JobTokenVerifier } from '../jobs/job-auth.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { DarajaConfigService } from './daraja-config.service.js';
import { DarajaClient, HttpDarajaClient, SimulatedDarajaClient } from './daraja.client.js';
import { HooksController } from './hooks.controller.js';
import { InboundService } from './inbound.service.js';
import { MpesaController, MpesaJobsController } from './mpesa.controller.js';
import { StkService } from './stk.service.js';

/** M-Pesa (phase 5): Daraja set-up, STK push, C2B, matching and reconciliation. */
@Module({
  imports: [PortfolioModule, PaymentsModule],
  controllers: [MpesaController, HooksController, MpesaJobsController],
  providers: [
    {
      provide: DarajaClient,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.DARAJA_MODE === 'live' ? new HttpDarajaClient() : new SimulatedDarajaClient(),
    },
    DarajaConfigService,
    InboundService,
    StkService,
    JobTokenVerifier,
    JobsGuard,
  ],
  exports: [DarajaConfigService, StkService, DarajaClient, InboundService],
})
export class MpesaModule implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The simulator "calls back" in-process, the way Safaricom would over HTTP. */
  onModuleInit() {
    const client = this.moduleRef.get(DarajaClient);
    if (!(client instanceof SimulatedDarajaClient)) return;
    const prisma = this.moduleRef.get(PrismaService, { strict: false });
    const stk = this.moduleRef.get(StkService);
    client.onComplete = async (checkoutRequestId, payload) => {
      const req = await prisma.stkRequest.findUnique({
        where: { checkoutRequestId },
        include: { channel: true },
      });
      if (!req) return;
      await runWithContext(emptyContext({ orgId: req.orgId }), () =>
        stk.handleCallback(req.channel, payload),
      );
    };
  }
}
