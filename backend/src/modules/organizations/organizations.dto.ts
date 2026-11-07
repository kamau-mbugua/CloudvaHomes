import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  Max,
  Min,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsMinorAmount } from '../portfolio/money.dto.js';

// KRA PIN: letter, 9 digits, letter (e.g. A123456789Z).
export const KRA_PIN = /^[A-Za-z]\d{9}[A-Za-z]$/;

export class LateFeesDto {
  @ApiProperty({ description: 'Charge late fees on overdue monthly invoices (default off)' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ enum: ['FLAT', 'PERCENT'] })
  @IsIn(['FLAT', 'PERCENT'])
  mode!: 'FLAT' | 'PERCENT';

  @IsMinorAmount({ description: 'FLAT: the fee, in cents' })
  amount!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 2500,
    description: 'PERCENT: basis points of the unpaid balance (500 = 5%)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2500)
  percentBps!: number;

  @ApiProperty({ minimum: 0, maximum: 60, description: 'Days after the due date before the fee' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  graceDays!: number;
}

export class RemindersDto {
  @ApiProperty({ description: 'Send automatic SMS reminders to tenants (default off)' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    minimum: 0,
    maximum: 14,
    description: 'Days before the due date; 0 = no "due soon" message',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(14)
  daysBefore!: number;

  @ApiProperty({
    type: [Number],
    description: 'Days after the due date to send "overdue" (up to 5)',
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(90, { each: true })
  overdueDays!: number[];
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '0712345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'A123456789Z', description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @Matches(new RegExp(`^$|${KRA_PIN.source}`), { message: 'kraPin must look like A123456789Z' })
  kraPin?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 60,
    description: 'Invoice due date = issue + N days',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  invoiceDueDays?: number;

  @ApiPropertyOptional({ type: RemindersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RemindersDto)
  reminders?: RemindersDto;

  @ApiPropertyOptional({ type: LateFeesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LateFeesDto)
  lateFees?: LateFeesDto;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Organisation-specific instructions printed on tenant Invoice PDFs',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  invoiceInstructions?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Organisation-specific instructions printed on tenant Receipt PDFs',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  receiptInstructions?: string | null;
}

export class OwnerDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ['LANDLORD', 'AGENCY', 'HOST'] })
  @IsIn(['LANDLORD', 'AGENCY', 'HOST'])
  kind!: 'LANDLORD' | 'AGENCY' | 'HOST';

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(KRA_PIN, { message: 'kraPin must look like A123456789Z' })
  kraPin?: string;

  @ApiPropertyOptional({
    description: 'Initial billing plan; defaults to the platform default plan',
  })
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ description: 'Salesperson/operator assigned to this organisation' })
  @IsOptional()
  @IsUUID()
  onboardedById?: string;

  @ApiProperty({ type: OwnerDto })
  @ValidateNested()
  @Type(() => OwnerDto)
  owner!: OwnerDto;
}
