import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

const METHODS = [
  'MPESA_PAYBILL',
  'MPESA_TILL',
  'BANK_ACCOUNT',
  'CASH',
  'CHEQUE',
  'DEPOSIT',
] as const;

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Receipt number, reference, payer, or tenant name/code/phone',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiPropertyOptional({ enum: METHODS })
  @IsOptional()
  @IsIn(METHODS)
  method?: (typeof METHODS)[number];

  @IsDateOnly({ optional: true, description: 'Received on or after' })
  @IsOptional()
  from?: string;

  @IsDateOnly({ optional: true, description: 'Received on or before' })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'true = include reversals and reversed payments (default true)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  reversed?: boolean;
}

class AllocationDto {
  @ApiProperty()
  @IsUUID()
  invoiceId!: string;

  @IsMinorAmount()
  amount!: number;
}

export class CreatePaymentDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiProperty()
  @IsUUID()
  channelId!: string;

  @IsMinorAmount({ description: 'Amount received, integer cents (> 0)' })
  amount!: number;

  @IsDateOnly({ description: 'When the money was received (not in the future)' })
  receivedAt!: string;

  @ApiPropertyOptional({ example: 'QJK3X7YB2M', description: 'M-Pesa code, cheque or slip number' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paidBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({
    type: [AllocationDto],
    description: 'Omit to pay open invoices oldest due first',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];

  @ApiPropertyOptional({ default: true, description: 'Send the tenant an SMS receipt' })
  @IsOptional()
  @IsBoolean()
  notifyTenant?: boolean;
}

export class ReversePaymentDto {
  @ApiProperty({ example: 'Cheque bounced' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class StatementQueryDto {
  @IsDateOnly({ optional: true })
  @IsOptional()
  from?: string;

  @IsDateOnly({ optional: true })
  @IsOptional()
  to?: string;
}

export class SettleDepositDto {
  @IsMinorAmount({
    optional: true,
    description: 'Use this much of the deposit on what the tenant owes',
  })
  @IsOptional()
  applyAmount?: number;

  @IsMinorAmount({ optional: true, description: 'Pay this much back to the tenant' })
  @IsOptional()
  refundAmount?: number;

  @ApiPropertyOptional({ description: 'How it was refunded (M-Pesa code, cheque no.)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  refundReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
