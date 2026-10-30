import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

export const MAINTENANCE_CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'CARPENTRY',
  'PAINTING',
  'PEST_CONTROL',
  'STRUCTURAL',
  'OTHER',
] as const;

export const MAINTENANCE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as const;

export type MaintenanceCategoryValue = (typeof MAINTENANCE_CATEGORIES)[number];
export type MaintenancePriorityValue = (typeof MAINTENANCE_PRIORITIES)[number];
export type MaintenanceStatusValue = (typeof MAINTENANCE_STATUSES)[number];

export class ListMaintenanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ enum: MAINTENANCE_STATUSES })
  @IsOptional()
  @IsIn(MAINTENANCE_STATUSES)
  status?: MaintenanceStatusValue;

  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriorityValue;

  @ApiPropertyOptional({ enum: MAINTENANCE_CATEGORIES })
  @IsOptional()
  @IsIn(MAINTENANCE_CATEGORIES)
  category?: MaintenanceCategoryValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class CreateMaintenanceRequestDto {
  @ApiProperty()
  @IsUUID()
  unitId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ enum: MAINTENANCE_CATEGORIES })
  @IsOptional()
  @IsIn(MAINTENANCE_CATEGORIES)
  category?: MaintenanceCategoryValue;

  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriorityValue;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  photoUploadIds?: string[];
}

export class CreateTenantMaintenanceRequestDto {
  @ApiPropertyOptional({ description: 'Defaults to the tenant’s active unit if only one' })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ enum: MAINTENANCE_CATEGORIES })
  @IsOptional()
  @IsIn(MAINTENANCE_CATEGORIES)
  category?: MaintenanceCategoryValue;

  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriorityValue;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  photoUploadIds?: string[];
}

export class UpdateMaintenanceRequestDto {
  @ApiPropertyOptional({ enum: MAINTENANCE_STATUSES })
  @IsOptional()
  @IsIn(MAINTENANCE_STATUSES)
  status?: MaintenanceStatusValue;

  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriorityValue;

  @ApiPropertyOptional({ enum: MAINTENANCE_CATEGORIES })
  @IsOptional()
  @IsIn(MAINTENANCE_CATEGORIES)
  category?: MaintenanceCategoryValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  photoUploadIds?: string[];
}

export class ConvertMaintenanceToExpenseDto {
  @IsMinorAmount()
  amount!: number;

  @IsDateOnly({ optional: true })
  @IsOptional()
  incurredOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payee?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  receiptUploadId?: string;
}
