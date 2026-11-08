import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { THEME_PRESETS, type ThemePreset } from '../rules/legal.js';
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

  @ApiPropertyOptional({ enum: THEME_PRESETS, example: 'ocean' })
  @IsOptional()
  @IsIn(THEME_PRESETS, { message: 'Choose one of the themes' })
  themePreset?: ThemePreset;

  @ApiPropertyOptional({ nullable: true, example: '#0E7490' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Use a colour like #1F4D3A' })
  brandColor?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null = use the starter Terms and Conditions',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20000)
  termsText?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Null = use the starter Terms of Use' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20000)
  termsOfUseText?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Null = use the starter Privacy Policy' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20000)
  privacyText?: string | null;
}

export class SlugCheckQueryDto {
  @ApiProperty({ example: 'cozy-stays' })
  @IsString()
  slug!: string;
}
