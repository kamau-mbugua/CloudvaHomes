import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsMinorAmount } from '../../portfolio/money.dto.js';
import { IsPeriod } from '../billing.dto.js';

const CHARGE_KINDS = ['FIXED', 'VARIABLE', 'METERED'] as const;
const MOVE_IN_KINDS = ['DEPOSIT', 'FEE'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class ListChargesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ enum: CHARGE_KINDS })
  @IsOptional()
  @IsIn(CHARGE_KINDS)
  kind?: (typeof CHARGE_KINDS)[number];

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class CreateChargeTypeDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ example: 'Water' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ enum: CHARGE_KINDS })
  @IsIn(CHARGE_KINDS)
  kind!: (typeof CHARGE_KINDS)[number];

  @IsMinorAmount({ optional: true, description: 'FIXED: monthly amount per unit (cents)' })
  @IsOptional()
  amount?: number;

  @IsMinorAmount({ optional: true, description: 'METERED: price per unit consumed (cents)' })
  @IsOptional()
  unitRate?: number;

  @ApiPropertyOptional({ example: 'm³' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  unitLabel?: string;

  @ApiPropertyOptional({ type: [String], description: 'Only these units; empty = all' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  unitIds?: string[];
}

export class UpdateChargeTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsMinorAmount({ optional: true })
  @IsOptional()
  amount?: number;

  @IsMinorAmount({ optional: true })
  @IsOptional()
  unitRate?: number;

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  unitLabel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  unitIds?: string[];

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class CreateMoveInChargeDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ example: 'Deposit' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ enum: MOVE_IN_KINDS })
  @IsIn(MOVE_IN_KINDS)
  kind!: (typeof MOVE_IN_KINDS)[number];

  @IsMinorAmount({ optional: true, description: 'Fixed amount — or use rentMonths' })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 24, description: 'N × the tenancy’s rent' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  rentMonths?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;
}

export class UpdateMoveInChargeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsMinorAmount({ optional: true, description: 'Setting it clears rentMonths' })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ description: 'Setting it clears amount' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  rentMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class ChargeEntriesQueryDto {
  @ApiProperty()
  @IsUUID()
  chargeTypeId!: string;

  @IsPeriod()
  period!: string;
}

class ChargeEntryDto {
  @ApiProperty()
  @IsUUID()
  unitId!: string;

  @IsMinorAmount({ optional: true, description: 'null removes the entry' })
  @IsOptional()
  amount?: number | null;
}

export class SaveChargeEntriesDto {
  @ApiProperty()
  @IsUUID()
  chargeTypeId!: string;

  @IsPeriod()
  period!: string;

  @ApiProperty({ type: [ChargeEntryDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ChargeEntryDto)
  entries!: ChargeEntryDto[];
}
