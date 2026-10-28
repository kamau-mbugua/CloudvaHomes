import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import { IsMinorAmount } from '../money.dto.js';

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const OCCUPANCY = ['OCCUPIED', 'NOTICE', 'VACANT'] as const;
export const UNIT_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ./-]{0,19}$/;
const NUMBER_MESSAGE = 'Unit numbers are 1–20 letters, digits, spaces or . / -';
export const MAX_BULK_UNITS = 500;

export class ListUnitsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Unit number, or the current tenant’s name or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ enum: OCCUPANCY })
  @IsOptional()
  @IsIn(OCCUPANCY)
  occupancy?: (typeof OCCUPANCY)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

/** Fields shared by single and bulk creation. */
class UnitFieldsDto {
  @ApiPropertyOptional({ default: 0, description: '0 = ground floor' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-5)
  @Max(200)
  floor?: number;

  @IsMinorAmount({ description: 'Default monthly rent, integer minor units' })
  rentAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  featureIds?: string[];
}

export class CreateUnitDto extends UnitFieldsDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ example: 'A4' })
  @IsString()
  @Matches(UNIT_NUMBER, { message: NUMBER_MESSAGE })
  number!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  sizeSqft?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class BulkCreateUnitsDto extends UnitFieldsDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ type: [String], example: ['A1', 'A2', 'A3'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_UNITS)
  @Matches(UNIT_NUMBER, { each: true, message: NUMBER_MESSAGE })
  numbers!: string[];
}

export class UpdateUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(UNIT_NUMBER, { message: NUMBER_MESSAGE })
  number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-5)
  @Max(200)
  floor?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  sizeSqft?: number | null;

  @IsMinorAmount({
    optional: true,
    description: 'New default rent (existing tenancies keep theirs)',
  })
  @IsOptional()
  rentAmount?: number;

  @ApiPropertyOptional({ nullable: true, description: 'null clears it' })
  @IsOptional()
  @IsUUID()
  unitTypeId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null clears it' })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  featureIds?: string[];

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: STATUSES, description: 'INACTIVE = not available to let' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
