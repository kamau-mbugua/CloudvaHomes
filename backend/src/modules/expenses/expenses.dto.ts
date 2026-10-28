import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

export const CATEGORIES = [
  'REPAIRS',
  'UTILITIES',
  'SECURITY',
  'CLEANING',
  'SALARIES',
  'TAXES',
  'INSURANCE',
  'MANAGEMENT',
  'OTHER',
] as const;
export type Category = (typeof CATEGORIES)[number];

export class FormatQueryDto {
  @ApiPropertyOptional({ enum: ['json', 'csv'] })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}

export class ListExpensesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, payee or reference' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: Category;

  @IsDateOnly({ optional: true })
  @IsOptional()
  from?: string;

  @IsDateOnly({ optional: true })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'true = only voided; false (default) = only current' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  voided?: boolean;

  @ApiPropertyOptional({
    enum: ['json', 'csv'],
    description: 'csv = every matching row, no paging',
  })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}

class ExpenseFieldsDto {
  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: Category;

  @ApiPropertyOptional({ example: 'Plumbing repair, block A' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payee?: string;

  @ApiPropertyOptional({ description: 'Invoice or receipt number from the supplier' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;

  @IsMinorAmount({ optional: true })
  @IsOptional()
  amount?: number;

  @IsDateOnly({ optional: true })
  @IsOptional()
  incurredOn?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'From POST /uploads (purpose EXPENSE_RECEIPT); null removes it',
  })
  @IsOptional()
  @IsUUID()
  receiptUploadId?: string | null;
}

export class CreateExpenseDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category!: Category;

  @ApiProperty({ example: 'Plumbing repair, block A' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payee?: string;

  @ApiPropertyOptional({ description: 'Invoice or receipt number from the supplier' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;

  @IsMinorAmount()
  amount!: number;

  @IsDateOnly()
  incurredOn!: string;

  @ApiPropertyOptional({ description: 'From POST /uploads (purpose EXPENSE_RECEIPT)' })
  @IsOptional()
  @IsUUID()
  receiptUploadId?: string;
}

export class UpdateExpenseDto extends ExpenseFieldsDto {}

export class VoidExpenseDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ListRecurringQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

class RecurringFieldsDto {
  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: Category;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payee?: string;

  @IsMinorAmount({ optional: true })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 12,
    description: '1 = monthly, 3 = quarterly, 12 = yearly',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  everyMonths?: number;

  @IsDateOnly({ optional: true, description: 'Last date to generate; empty = no end' })
  @IsOptional()
  endDate?: string;
}

export class CreateRecurringDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category!: Category;

  @ApiProperty({ example: 'Security guards' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payee?: string;

  @IsMinorAmount()
  amount!: number;

  @ApiProperty({ minimum: 1, maximum: 12, description: '1 = monthly, 3 = quarterly, 12 = yearly' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  everyMonths!: number;

  @IsDateOnly({ description: 'First date; its day of month (capped at 28) repeats' })
  startDate!: string;

  @IsDateOnly({ optional: true, description: 'Last date to generate' })
  @IsOptional()
  endDate?: string;
}

export class UpdateRecurringDto extends RecurringFieldsDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
