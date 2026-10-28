import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

export class SetDarajaDto {
  @ApiProperty({ enum: ['SANDBOX', 'PRODUCTION'] })
  @IsIn(['SANDBOX', 'PRODUCTION'])
  environment!: 'SANDBOX' | 'PRODUCTION';

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  consumerKey!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  consumerSecret!: string;

  @ApiPropertyOptional({
    description: 'Lipa na M-Pesa Online passkey (needed for payment prompts)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  passkey?: string;

  @ApiPropertyOptional({ description: 'Tills only: the head-office (store) number' })
  @IsOptional()
  @IsString()
  @Matches(/^(\d{5,7})?$/, { message: 'storeNumber must be 5–7 digits' })
  storeNumber?: string;
}

export class StkPushDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiProperty()
  @IsUUID()
  channelId!: string;

  @IsMinorAmount({
    description: 'Whole shillings only (M-Pesa has no cents), in cents: 150000 = KES 1,500',
  })
  amount!: number;

  @ApiPropertyOptional({ description: 'Defaults to the tenant’s phone' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ type: [String], description: 'Pay these invoices first' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  invoiceIds?: string[];
}

export class ListStkQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'] })
  @IsOptional()
  @IsIn(['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'])
  state?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
}

export class ListInboundQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['UNMATCHED', 'MATCHED', 'IGNORED'] })
  @IsOptional()
  @IsIn(['UNMATCHED', 'MATCHED', 'IGNORED'])
  status?: 'UNMATCHED' | 'MATCHED' | 'IGNORED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiPropertyOptional({ enum: ['MPESA_STK', 'MPESA_C2B'] })
  @IsOptional()
  @IsIn(['MPESA_STK', 'MPESA_C2B'])
  source?: 'MPESA_STK' | 'MPESA_C2B';

  @ApiPropertyOptional({ description: 'Receipt, account reference, payer name or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsDateOnly({ optional: true })
  @IsOptional()
  from?: string;

  @IsDateOnly({ optional: true })
  @IsOptional()
  to?: string;
}

class AllocationDto {
  @ApiProperty()
  @IsUUID()
  invoiceId!: string;

  @IsMinorAmount()
  amount!: number;
}

export class AssignInboundDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiPropertyOptional({ type: [AllocationDto], description: 'Omit for oldest due first' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
}

export class IgnoreInboundDto {
  @ApiProperty({ example: 'Not rent: supplier refund' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
