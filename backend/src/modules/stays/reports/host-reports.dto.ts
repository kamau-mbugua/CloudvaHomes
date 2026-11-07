import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { IsDateOnly } from '../../../common/dates/date-only.js';

export class HostReportSummaryQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateOnly()
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateOnly()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'] })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}
