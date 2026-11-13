import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  NotEquals,
  ValidateIf,
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';

export const SMS_PROVIDERS = ['AFRICASTALKING', 'TEXTSMS', 'HOSTPINNACLE'] as const;

export class UpdateSmsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000) lowBalanceLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fallbackToPlatform?: boolean;
}

export class SmsUsageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['SENT', 'FAILED', 'NO_UNITS'] })
  @IsOptional()
  @IsIn(['SENT', 'FAILED', 'NO_UNITS'])
  status?: 'SENT' | 'FAILED' | 'NO_UNITS';
  @IsOptional() @IsDateOnly({ optional: true }) from?: string;
  @IsOptional() @IsDateOnly({ optional: true }) to?: string;
}

export class AdminSmsSetupDto {
  @ApiProperty({ enum: ['PLATFORM', 'OWN'] }) @IsIn(['PLATFORM', 'OWN']) mode!: 'PLATFORM' | 'OWN';
  @ApiPropertyOptional({ enum: SMS_PROVIDERS })
  @IsOptional()
  @IsIn(SMS_PROVIDERS)
  provider?: (typeof SMS_PROVIDERS)[number];
  @ApiPropertyOptional({ description: 'AT username, TextSMS partner ID or HostPinnacle user ID' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  providerUser?: string;
  @ApiPropertyOptional({ description: 'Write-only API key' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  apiKey?: string;
  @ApiPropertyOptional({ description: 'Write-only HostPinnacle password' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) senderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sandbox?: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'Cents per unit; null = platform price' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{1,6}$/, { message: 'unitPrice must be a whole number of cents' })
  unitPrice?: string | null;
}

export class SmsTestDto {
  @ApiProperty() @IsString() @MinLength(9) @MaxLength(20) phone!: string;
}

export class SmsAdjustDto {
  @ApiProperty({ description: 'Units to add (negative removes)' })
  @IsInt()
  @NotEquals(0)
  @Min(-1_000_000)
  @Max(1_000_000)
  units!: number;
  @ApiProperty()
  @IsString()
  @MinLength(3, { message: 'Give a reason' })
  @MaxLength(200)
  reason!: string;
}

export class SmsReportQueryDto {
  @ApiProperty({ example: '2026-11' })
  @Type(() => String)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must look like 2026-11' })
  month!: string;
}

const SMS_STATUSES = ['SENT', 'FAILED', 'NO_UNITS'] as const;

/** KodiHub admin list of every SMS. Dates are Nairobi days. */
export class SmsLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ enum: ['PLATFORM', 'ORG'], description: 'PLATFORM = KodiHub’s own' })
  @IsOptional()
  @IsIn(['PLATFORM', 'ORG'])
  kind?: 'PLATFORM' | 'ORG';
  @ApiPropertyOptional({ enum: SMS_STATUSES })
  @IsOptional()
  @IsIn(SMS_STATUSES)
  status?: (typeof SMS_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z_]{1,40}$/) type?: string;
  @ApiPropertyOptional({ enum: SMS_PROVIDERS })
  @IsOptional()
  @IsIn(SMS_PROVIDERS)
  provider?: (typeof SMS_PROVIDERS)[number];
  @ApiPropertyOptional({ description: 'Phone number, any format' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  q?: string;
  @IsOptional() @IsDateOnly({ optional: true }) from?: string;
  @IsOptional() @IsDateOnly({ optional: true }) to?: string;
}

export class SmsStatsQueryDto {
  @IsOptional() @IsDateOnly({ optional: true }) from?: string;
  @IsOptional() @IsDateOnly({ optional: true }) to?: string;
}

export class RevealSmsSecretDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, { message: 'Say why you need to see it (at least 10 characters)' })
  @MaxLength(500)
  reason!: string;
}
