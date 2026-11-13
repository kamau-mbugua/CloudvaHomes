import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { StaysModule } from '../stays/stays.module.js';
import { PublicReceiptsController } from './public-receipts.controller.js';

/** Receipt links sent by SMS: rent receipts (payments) and short-stay receipts (stays). */
@Module({
  imports: [PaymentsModule, StaysModule],
  controllers: [PublicReceiptsController],
})
export class ReceiptsModule {}
