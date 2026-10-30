import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import { KRA_PIN } from '../../organizations/organizations.dto.js';

const STATUSES = ['CURRENT', 'PAST', 'PROSPECT'] as const;
export type TenantStatus = (typeof STATUSES)[number];
const KRA_OR_EMPTY = new RegExp(`^$|${KRA_PIN.source}`);

export class ListTenantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name, phone, code or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: STATUSES,
    description: 'CURRENT = renting now; PAST = moved out; PROSPECT = never moved in',
  })
  @IsOptional()
  @IsIn(STATUSES)
  status?: TenantStatus;

  @ApiPropertyOptional({ description: 'Tenants with any tenancy in this property' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: '0712345678' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ description: 'National ID or passport number (stored encrypted)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  idNumber?: string;

  @ApiPropertyOptional({ example: 'A123456789Z' })
  @IsOptional()
  @IsString()
  @Matches(KRA_OR_EMPTY, { message: 'kraPin must look like A123456789Z' })
  kraPin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/** Same fields, all optional. Empty strings clear optional fields. */
export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  idNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(KRA_OR_EMPTY, { message: 'kraPin must look like A123456789Z' })
  kraPin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'true = no automatic SMS reminders' })
  @IsOptional()
  @IsBoolean()
  remindersOff?: boolean;
}

export class ImportTenantsCsvDto {
  @ApiProperty({ description: 'UTF-8 CSV text containing tenants to import' })
  @IsString()
  @MaxLength(1_000_000)
  csv!: string;

  @ApiPropertyOptional({ description: 'When true, validates and previews without saving' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
