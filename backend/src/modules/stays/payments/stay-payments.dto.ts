import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsDateOnly } from '../../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import type { PaymentMethod } from '../../../generated/prisma/client.js';

export const STAY_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH',
  'BANK_ACCOUNT',
  'MPESA_PAYBILL',
  'MPESA_TILL',
] as const;

export class CreateStayPaymentDto {
  @IsIn(STAY_PAYMENT_METHODS)
  method!: PaymentMethod;

  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;
}

export class CreateStayRefundDto {
  @IsIn(STAY_PAYMENT_METHODS)
  method!: PaymentMethod;

  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;
}

export class VoidStayPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BookingMpesaPromptDto {
  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

/** Money → Receipts for short stays: every stay payment and refund, newest first. */
export class ListStayReceiptsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(['PAYMENT', 'REFUND'])
  kind?: 'PAYMENT' | 'REFUND';

  @IsOptional()
  @IsIn(STAY_PAYMENT_METHODS)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateOnly({ optional: true })
  from?: string;

  @IsOptional()
  @IsDateOnly({ optional: true })
  to?: string;
}
