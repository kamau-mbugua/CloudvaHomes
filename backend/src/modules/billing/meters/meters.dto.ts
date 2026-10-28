import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsPeriod, IsQuantity } from '../billing.dto.js';

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class ListMetersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  chargeTypeId?: string;
}

export class CreateMeterDto {
  @ApiProperty()
  @IsUUID()
  unitId!: string;

  @ApiProperty({ description: 'A METERED charge of the unit’s property' })
  @IsUUID()
  chargeTypeId!: string;

  @ApiProperty({ example: 'WM-00123' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  serialNo!: string;

  @IsQuantity({ optional: true, description: 'Reading when the meter was installed (default 0)' })
  @IsOptional()
  initialReading?: string;
}

export class UpdateMeterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  serialNo?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class ReadingSheetQueryDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty()
  @IsUUID()
  chargeTypeId!: string;

  @IsPeriod()
  period!: string;
}

class ReadingDto {
  @ApiProperty()
  @IsUUID()
  meterId!: string;

  @IsQuantity()
  current!: string;

  @IsQuantity({
    optional: true,
    description: 'Defaults to the last reading (e.g. after a meter swap)',
  })
  @IsOptional()
  previous?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ description: 'From POST /uploads (purpose METER_PHOTO)' })
  @IsOptional()
  @IsUUID()
  photoUploadId?: string;
}

export class SaveReadingsDto {
  @IsPeriod()
  period!: string;

  @ApiProperty({ type: [ReadingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ReadingDto)
  readings!: ReadingDto[];
}
