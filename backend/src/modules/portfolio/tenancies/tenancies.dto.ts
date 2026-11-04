import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import { IsMinorAmount } from '../money.dto.js';
import { CreateTenantDto } from '../tenants/tenants.dto.js';

const STATUSES = ['ACTIVE', 'NOTICE', 'ENDED'] as const;

export class ListTenanciesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tenant name, phone or code, or unit number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

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

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 365,
    description: 'Current tenancies whose lease ends within this many days (or already ended)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiring?: number;
}

class BillingFieldsDto {
  @IsMinorAmount({ optional: true, description: 'Monthly rent; defaults to the unit’s rent' })
  @IsOptional()
  rentAmount?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 28, description: 'Day of the month rent is billed' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number;
}

/** Move-in: an existing tenant (`tenantId`) or a new one (`tenant`), not both. */
export class CreateTenancyDto extends BillingFieldsDto {
  @ApiProperty()
  @IsUUID()
  unitId!: string;

  @ApiPropertyOptional({ description: 'An existing tenant' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ type: CreateTenantDto, description: 'Or register a new tenant' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTenantDto)
  tenant?: CreateTenantDto;

  @IsDateOnly({ description: 'Move-in date' })
  startDate!: string;

  @IsMinorAmount({
    optional: true,
    description: 'Deposit already held (opening balance when migrating an existing tenant)',
  })
  @IsOptional()
  depositHeld?: number;

  @ApiPropertyOptional({
    description:
      'Issue the move-in invoice from the property’s move-in charges. Default: yes when it has any and you may invoice',
  })
  @IsOptional()
  @IsBoolean()
  issueMoveInInvoice?: boolean;

  @IsDateOnly({ optional: true, description: 'When the lease runs out (optional)' })
  @IsOptional()
  leaseEndDate?: string;
}

export class UpdateTenancyDto extends BillingFieldsDto {
  @IsDateOnly({ optional: true, description: 'When the lease runs out; null clears it' })
  @IsOptional()
  leaseEndDate?: string | null;
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class RentChangeDto {
  @IsMinorAmount({ description: 'The new monthly rent, in cents' })
  newRent!: number;

  @ApiProperty({ example: '2027-01', description: 'First month (YYYY-MM) billed at the new rent' })
  @Matches(PERIOD, { message: 'effectivePeriod must be a month like 2027-01' })
  effectivePeriod!: string;

  @ApiPropertyOptional({ example: 'Annual review' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({
    description: 'Text the tenant (and notify them in the app) about the change',
  })
  @IsOptional()
  @IsBoolean()
  notifyTenant?: boolean;
}

export class RenewTenancyDto {
  @IsDateOnly({ description: 'The new lease end date' })
  leaseEndDate!: string;

  @IsMinorAmount({
    optional: true,
    description: 'With the renewal, a new rent from effectivePeriod',
  })
  @IsOptional()
  newRent?: number;

  @ApiPropertyOptional({ example: '2027-01' })
  @IsOptional()
  @Matches(PERIOD, { message: 'effectivePeriod must be a month like 2027-01' })
  effectivePeriod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyTenant?: boolean;
}

export class NoticeDto {
  @IsDateOnly({ description: 'Expected move-out date' })
  endDate!: string;
}

export class MoveOutDto {
  @IsDateOnly({ description: 'Actual move-out date' })
  endDate!: string;

  @ApiPropertyOptional({ example: 'Relocated for work' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AttachLeaseDocumentDto {
  @ApiProperty({ description: 'Uploaded LEASE_DOCUMENT file id' })
  @IsUUID()
  uploadId!: string;
}
