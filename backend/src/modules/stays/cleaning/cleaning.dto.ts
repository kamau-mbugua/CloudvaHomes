import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.js';

export class ListCleaningQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'DONE'] })
  @IsOptional()
  @IsIn(['OPEN', 'DONE'])
  status?: 'OPEN' | 'DONE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}

export class CompleteCleaningDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateCleaningDto {
  @ApiProperty()
  @IsUUID()
  unitId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
