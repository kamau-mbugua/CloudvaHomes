import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { StayRules } from '../rules/terms.js';

export class UpdateHostSiteDto {
  @ApiPropertyOptional({ nullable: true, example: 'cozy-stays' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  slug?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({ example: 'Cozy Stays Nairobi' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  about?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(30)
  contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(30)
  whatsappPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rules?: StayRules;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  houseRules?: string | null;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Use 24-hour time HH:MM, e.g. 14:00' })
  checkInTime?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Use 24-hour time HH:MM, e.g. 10:00' })
  checkOutTime?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  logoUploadId?: string | null;
}

export class SlugCheckQueryDto {
  @ApiProperty({ example: 'cozy-stays' })
  @IsString()
  slug!: string;
}
