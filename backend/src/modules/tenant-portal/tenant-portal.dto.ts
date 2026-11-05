import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

const KINDS = ['REMINDER_DUE', 'REMINDER_OVERDUE', 'REMINDER_MANUAL', 'PORTAL_ACCESS'] as const;

export class ListMessagesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @ApiPropertyOptional({ enum: ['SENT', 'FAILED'] })
  @IsOptional()
  @IsIn(['SENT', 'FAILED'])
  status?: 'SENT' | 'FAILED';

  @IsDateOnly({ optional: true })
  @IsOptional()
  from?: string;

  @IsDateOnly({ optional: true })
  @IsOptional()
  to?: string;
}

export class BulkPortalDto {
  @ApiPropertyOptional({ description: 'Only current tenants of this property' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}

export class TenantPayDto {
  @IsMinorAmount({ description: 'Whole shillings, in cents' })
  amount!: number;

  @ApiPropertyOptional({ description: 'Defaults to your phone' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class TenantInvoicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] })
  @IsOptional()
  @IsIn(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'])
  status?: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

  @ApiPropertyOptional({ format: 'uuid', description: 'Only this home’s invoices' })
  @IsOptional()
  @IsUUID()
  tenancyId?: string;
}

/** `GET /tenant/accounts/overview/monthly` — billed vs paid per month (tenant dashboard). */
export class TenantMonthlyQueryDto {
  @ApiPropertyOptional({ enum: [6, 12], default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([6, 12])
  months: 6 | 12 = 6;

  @ApiPropertyOptional({ format: 'uuid', description: 'One home; omit for all my homes' })
  @IsOptional()
  @IsUUID()
  tenancyId?: string;
}

/** `GET /tenant/accounts/overview/activity` — latest events across my homes. */
export class TenantActivityQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 8;

  @ApiPropertyOptional({ format: 'uuid', description: 'One home; omit for all my homes' })
  @IsOptional()
  @IsUUID()
  tenancyId?: string;
}

export class RunRemindersDto {
  @ApiPropertyOptional({
    description: 'true = only count who would be texted today; nothing is sent or recorded',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

/** `GET /tenant/notices` — my tenant notices, optionally one landlord account's. */
export class TenantNoticesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'One of my tenant accounts' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
