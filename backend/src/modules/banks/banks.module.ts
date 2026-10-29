import { Module } from '@nestjs/common';
import { MpesaModule } from '../mpesa/mpesa.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BankHooksController, BanksController } from './banks.controller.js';
import { BanksService } from './banks.service.js';

/** Bank money-in (phase 10): CSV statements and signed notifications. */
@Module({
  imports: [PaymentsModule, MpesaModule],
  controllers: [BanksController, BankHooksController],
  providers: [BanksService],
})
export class BanksModule {}
