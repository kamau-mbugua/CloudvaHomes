import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import { KRA_PIN } from '../../organizations/organizations.dto.js';

const KINDS = ['INDIVIDUAL', 'COMPANY'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const KRA_OR_EMPTY = new RegExp(`^$|${KRA_PIN.source}`);

export class ListLandlordsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name, code, phone or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class CreateLandlordDto {
  @ApiProperty({ example: 'Wanjiku Holdings Ltd' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @ApiProperty({ example: '0712345678' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ description: 'National ID or company registration number (encrypted)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  idNumber?: string;

  @ApiPropertyOptional({ example: 'A123456789Z', description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @Matches(KRA_OR_EMPTY, { message: 'kraPin must look like A123456789Z' })
  kraPin?: string;
}

export class UpdateLandlordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  idNumber?: string;

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @Matches(KRA_OR_EMPTY, { message: 'kraPin must look like A123456789Z' })
  kraPin?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
