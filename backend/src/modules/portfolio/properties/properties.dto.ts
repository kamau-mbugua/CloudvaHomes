import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.js';

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const CODE = /^[A-Za-z0-9]{2,10}$/;

export class ListPropertiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name, code or location' })
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
  landlordId?: string;
}

export class CreatePropertyDto {
  @ApiProperty({ example: 'Kilimani Heights' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'KIL', description: '2–10 letters or digits; stored upper-case' })
  @IsString()
  @Matches(CODE, { message: 'code must be 2–10 letters or digits' })
  code!: string;

  @ApiPropertyOptional({ example: 'Argwings Kodhek Rd' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  county?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  floors?: number;

  @ApiPropertyOptional({ description: 'Required for agencies; not allowed for landlords' })
  @IsOptional()
  @IsUUID()
  landlordId?: string;
}

export class UpdatePropertyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(CODE, { message: 'code must be 2–10 letters or digits' })
  code?: string;

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  county?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  floors?: number;

  @ApiPropertyOptional({ description: 'Agencies only: move the property to another landlord' })
  @IsOptional()
  @IsUUID()
  landlordId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
