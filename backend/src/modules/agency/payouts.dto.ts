import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SetB2cAccountDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @ApiProperty({ description: 'The B2C (bulk disbursement) shortcode' })
  @Matches(/^\d{5,7}$/, { message: 'shortcode must be 5–7 digits' })
  shortcode!: string;
  @ApiProperty({ enum: ['SANDBOX', 'PRODUCTION'] })
  @IsIn(['SANDBOX', 'PRODUCTION'])
  environment!: 'SANDBOX' | 'PRODUCTION';
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) initiatorName!: string;
  @ApiPropertyOptional({ description: 'Write-only; blank keeps the saved one' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  consumerKey?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  consumerSecret?: string;
  @ApiPropertyOptional({ description: 'From the Daraja portal; write-only' })
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  securityCredential?: string;
}

export class ResolvePayoutDto {
  @ApiProperty({ enum: ['PAID', 'NOT_PAID'] })
  @IsIn(['PAID', 'NOT_PAID'])
  outcome!: 'PAID' | 'NOT_PAID';
  @ApiPropertyOptional({ description: 'The M-Pesa receipt, when it was paid' })
  @ValidateIf((o: ResolvePayoutDto) => o.outcome === 'PAID')
  @Matches(/^[A-Z0-9]{8,12}$/i, { message: 'Enter the M-Pesa receipt, e.g. SJR4XK2L9P' })
  receipt?: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) note!: string;
}

export class BulkFileQueryDto {
  @ApiProperty({ description: 'Comma-separated remittance ids' })
  @Matches(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,199}$/i, { message: 'Choose 1–200 remittances' })
  ids!: string;
}
