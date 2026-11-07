import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
