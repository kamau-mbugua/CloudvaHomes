import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsPeriod } from '../billing/billing.dto.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

const BASES = ['PERCENT_OF_COLLECTED', 'PERCENT_OF_INVOICED', 'FIXED_MONTHLY'] as const;
const LINES = ['RENT', 'CHARGE', 'MOVE_IN', 'ADJUSTMENT'] as const;
const MODES = ['AGENCY_COLLECTS', 'LANDLORD_COLLECTS'] as const;

export class ListAgreementsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  landlordId?: string;

  @ApiPropertyOptional({ description: 'true = only agreements in force today' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  active?: boolean;
}

export class CreateAgreementDto {
  @ApiProperty()
  @IsUUID()
  landlordId!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Only these of the landlord’s properties; empty = all',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  propertyIds?: string[];

  @ApiProperty({ enum: BASES })
  @IsIn(BASES)
  commissionBasis!: (typeof BASES)[number];

  @ApiPropertyOptional({ description: 'Percent bases: basis points, 1000 = 10%' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  commissionBps?: number;

  @IsMinorAmount({ optional: true, description: 'FIXED_MONTHLY: amount per month (cents)' })
  @IsOptional()
  fixedAmount?: number;

  @ApiPropertyOptional({ enum: LINES, isArray: true, description: 'Default: rent only' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(LINES, { each: true })
  commissionableLines?: (typeof LINES)[number][];

  @ApiPropertyOptional({ enum: MODES, default: 'AGENCY_COLLECTS' })
  @IsOptional()
  @IsIn(MODES)
  collection?: (typeof MODES)[number];

  @ApiProperty({ minimum: 1, maximum: 28 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  remittanceDay!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  deductExpenses?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  holdDeposits?: boolean;

  @IsDateOnly()
  startDate!: string;

  @IsDateOnly({ optional: true })
  @IsOptional()
  endDate?: string;
}

/** Once an agreement has ledger entries only `endDate` may change. */
export class UpdateAgreementDto {
  @IsDateOnly({ optional: true, description: 'Empty string = no end' })
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  commissionBps?: number;

  @IsMinorAmount({ optional: true })
  @IsOptional()
  fixedAmount?: number;

  @ApiPropertyOptional({ enum: LINES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(LINES, { each: true })
  commissionableLines?: (typeof LINES)[number][];

  @ApiPropertyOptional({ enum: MODES })
  @IsOptional()
  @IsIn(MODES)
  collection?: (typeof MODES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  remittanceDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deductExpenses?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  holdDeposits?: boolean;
}

export class LedgerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['PAYABLE', 'DEPOSIT_HELD'] })
  @IsOptional()
  @IsIn(['PAYABLE', 'DEPOSIT_HELD'])
  bucket?: 'PAYABLE' | 'DEPOSIT_HELD';

  @IsDateOnly({ optional: true })
  @IsOptional()
  from?: string;

  @IsDateOnly({ optional: true })
  @IsOptional()
  to?: string;
}

export class AdjustmentDto {
  @ApiProperty({ enum: ['PAYABLE', 'DEPOSIT_HELD'] })
  @IsIn(['PAYABLE', 'DEPOSIT_HELD'])
  bucket!: 'PAYABLE' | 'DEPOSIT_HELD';

  @ApiProperty({ description: 'Signed cents: + owed to the landlord, − owed by them' })
  @Type(() => Number)
  @IsInt()
  @Min(-1_000_000_000_000)
  @Max(1_000_000_000_000)
  amount!: number;

  @ApiProperty({ example: 'Opening balance at migration' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  memo!: string;
}

export class PayoutDto {
  @ApiProperty({ enum: ['BANK', 'MPESA', 'CHEQUE'] })
  @IsIn(['BANK', 'MPESA', 'CHEQUE'])
  method!: 'BANK' | 'MPESA' | 'CHEQUE';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) branch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) accountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9 -]{4,30}$/, { message: 'accountNumber must be digits' })
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'M-Pesa number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Cheques: who they are made out to' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payeeName?: string;
}

export class StatementRangeDto {
  @IsPeriod({ optional: true })
  @IsOptional()
  from?: string;

  @IsPeriod({ optional: true })
  @IsOptional()
  to?: string;
}

export class ListRemittancesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  landlordId?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'])
  status?: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';

  @IsPeriod({ optional: true })
  @IsOptional()
  period?: string;
}

export class DraftRemittanceDto {
  @ApiProperty()
  @IsUUID()
  landlordId!: string;

  @IsPeriod()
  period!: string;
}

export class PayRemittanceDto {
  @ApiProperty({ enum: ['BANK', 'MPESA', 'CHEQUE'] })
  @IsIn(['BANK', 'MPESA', 'CHEQUE'])
  method!: 'BANK' | 'MPESA' | 'CHEQUE';

  @ApiProperty({ example: 'FT26300ABCD' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  reference!: string;

  @IsDateOnly({ optional: true, description: 'Default today' })
  @IsOptional()
  paidAt?: string;
}

export class CancelRemittanceDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
