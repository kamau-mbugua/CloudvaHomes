import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CHANNEL_KINDS = [
  'MPESA_PAYBILL',
  'MPESA_TILL',
  'BANK_ACCOUNT',
  'CASH',
  'CHEQUE',
] as const;
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class ListChannelsQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

/** Optional text fields: an empty string clears them. */
class ChannelFieldsDto {
  @ApiPropertyOptional({ example: '522522', description: 'Paybill or till number' })
  @IsOptional()
  @IsString()
  @Matches(/^(\d{5,7})?$/, { message: 'shortcode must be 5–7 digits' })
  shortcode?: string;

  @ApiPropertyOptional({ example: 'Equity Bank' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName?: string;

  @ApiPropertyOptional({ type: [String], description: 'Only these properties; empty = all' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  propertyIds?: string[];
}

export class CreateChannelDto extends ChannelFieldsDto {
  @ApiProperty({ enum: CHANNEL_KINDS })
  @IsIn(CHANNEL_KINDS)
  kind!: (typeof CHANNEL_KINDS)[number];

  @ApiProperty({ example: 'Main paybill' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class UpdateChannelDto extends ChannelFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
