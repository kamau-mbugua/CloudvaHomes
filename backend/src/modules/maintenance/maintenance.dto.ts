import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsEmail,
  MaxLength,
  MinLength,
  ValidateIf,
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

  @ApiPropertyOptional({ description: 'Open jobs past their priority’s response time (phase 18)' })
  @IsOptional()
  @IsIn(['true'])
  late?: 'true';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vendorId?: string;
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

// ── Vendors (phase 18, first step) ──

export class ListVendorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;

  @ApiPropertyOptional({ enum: MAINTENANCE_CATEGORIES })
  @IsOptional()
  @IsIn(MAINTENANCE_CATEGORIES)
  trade?: MaintenanceCategoryValue;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Default: active only' })
  @IsOptional()
  @IsIn(['true', 'false', 'all'])
  active?: 'true' | 'false' | 'all';
}

export class CreateVendorDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty({ example: '0712345678' }) @IsString() @MaxLength(20) phone!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ enum: MAINTENANCE_CATEGORIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAINTENANCE_CATEGORIES.length)
  @IsIn(MAINTENANCE_CATEGORIES, { each: true })
  trades?: MaintenanceCategoryValue[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateVendorDto extends CreateVendorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) declare phone: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class AssignVendorDto {
  @ApiProperty({ nullable: true, description: 'null takes the job off the vendor' })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  vendorId!: string | null;

  @ApiPropertyOptional({ default: true, description: 'Text the vendor the job' })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
