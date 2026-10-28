import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import { IsMinorAmount } from '../../portfolio/money.dto.js';
import { IsPeriod } from '../billing.dto.js';

const STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
const KINDS = ['MONTHLY', 'MOVE_IN', 'ADHOC'] as const;

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Invoice number, tenant name/code/phone, or unit number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @IsPeriod({ optional: true })
  @IsOptional()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenancyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ description: 'true = balance owing and past the due date' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;
}

class AdhocLineDto {
  @ApiProperty({ example: 'Replacement key' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsMinorAmount()
  amount!: number;
}

export class CreateAdhocInvoiceDto {
  @ApiProperty()
  @IsUUID()
  tenancyId!: string;

  @ApiProperty({ type: [AdhocLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AdhocLineDto)
  lines!: AdhocLineDto[];

  @IsDateOnly({ optional: true, description: 'Defaults to today + the organisation’s due days' })
  @IsOptional()
  dueDate?: string;
}

export class VoidInvoiceDto {
  @ApiProperty({ example: 'Billed the wrong unit' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class CreateCreditNoteDto {
  @IsMinorAmount()
  amount!: number;

  @ApiProperty({ example: 'Water leak — usage waived' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class RunQueryDto {
  @IsDateOnly({ optional: true, description: 'Defaults to today (Nairobi)' })
  @IsOptional()
  date?: string;
}
