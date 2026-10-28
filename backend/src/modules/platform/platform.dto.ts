import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsPeriod } from '../billing/billing.dto.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

export class CreatePlanDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsMinorAmount({ description: 'Per occupied unit per month (cents)' }) pricePerUnit!: number;
  @IsMinorAmount({ optional: true, description: 'Monthly minimum (cents)' })
  @IsOptional()
  minimumMonthly?: number;
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsMinorAmount({ optional: true }) @IsOptional() pricePerUnit?: number;
  @IsMinorAmount({ optional: true }) @IsOptional() minimumMonthly?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

const STATUSES = ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CLOSED'] as const;

export class ListOrgsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

/** `null` clears an override or date. */
export class UpdateOrgBillingDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Custom price per unit (cents); null = the plan’s',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  priceOverride?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  minimumOverride?: number | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  trialEndsAt?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  noSuspendUntil?: string | null;

  @ApiPropertyOptional({
    enum: ['ACTIVE', 'CLOSED'],
    description: 'Close an organisation, or reopen it',
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'CLOSED'])
  status?: 'ACTIVE' | 'CLOSED';
}

export class ListPlatformInvoicesDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ enum: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] })
  @IsOptional()
  @IsIn(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'])
  status?: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  @IsPeriod({ optional: true }) @IsOptional() period?: string;
}

export class RunPlatformDto {
  @IsPeriod() period!: string;
}

export class VoidPlatformInvoiceDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class ListPlatformPaymentsDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
}

export class RecordPlatformPaymentDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @IsMinorAmount() amount!: number;
  @ApiProperty({ enum: ['MPESA', 'BANK', 'CHEQUE', 'OTHER'] })
  @IsIn(['MPESA', 'BANK', 'CHEQUE', 'OTHER'])
  method!: 'MPESA' | 'BANK' | 'CHEQUE' | 'OTHER';
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) reference!: string;
  @IsDateOnly() receivedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PlatformSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  dueDays?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  suspendAfterDays?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultPlanId?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Hodi’s paybill' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{5,7}$/, { message: 'paybill must be 5–7 digits' })
  paybill?: string | null;
  @ApiPropertyOptional({ enum: ['SANDBOX', 'PRODUCTION'] })
  @IsOptional()
  @IsIn(['SANDBOX', 'PRODUCTION'])
  darajaEnvironment?: 'SANDBOX' | 'PRODUCTION';
  @ApiPropertyOptional({ description: 'Write-only; needs step-up' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  consumerKey?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  consumerSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) passkey?: string;
}

export class BillingPayDto {
  @IsMinorAmount({ description: 'Whole shillings, in cents' }) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
}
