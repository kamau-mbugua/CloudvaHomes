import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
import { CONDITIONS, MAX_AREAS, MAX_PHOTOS } from './inspection-rules.js';

export class InspectionItemDto {
  @ApiProperty({ example: 'Kitchen' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  area!: string;

  @ApiProperty({ enum: CONDITIONS })
  @IsIn(CONDITIONS)
  condition!: (typeof CONDITIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [String], description: `Up to ${MAX_PHOTOS} INSPECTION_PHOTO upload ids` })
  @IsArray()
  @ArrayMaxSize(50) // the per-area limit is checked with a clear message by the service
  @IsUUID('all', { each: true })
  photoUploadIds!: string[];
}

export class SaveInspectionDto {
  @IsDateOnly({ description: 'Day of the inspection' })
  inspectedOn!: string;

  @ApiProperty({ type: [InspectionItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_AREAS + 20) // the limit itself is checked with a clear message by the service
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items!: InspectionItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  inspectorName?: string;

  @ApiPropertyOptional({ description: 'Edit one the tenant already acknowledged (clears it)' })
  @IsOptional()
  @IsBoolean()
  reopen?: boolean;

  @ApiPropertyOptional({
    description:
      'The version this edit started from: the inspection’s `updatedAt`, or "none" for a new ' +
      'one. When given and the saved inspection has changed since, the save is refused ' +
      '(INSPECTION_CHANGED), so an edit made offline never overwrites newer work.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  baseVersion?: string;
}
