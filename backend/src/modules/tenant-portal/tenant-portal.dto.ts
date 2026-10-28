import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
}
