import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import type { StayRules } from '../rules/terms.js';

const toMinorInputString = ({ value }: { value: unknown }) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : value;

export class ListListingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  published?: boolean;
}

/** Where the listing is: picked from Google Places (or a pasted map link) in the editor. */
export class ListingLocationDto {
  @ApiProperty({ example: 'Makini Court, Argwings Kodhek Rd, Nairobi' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  address!: string;

  @ApiProperty({ example: -1.2920659 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 36.787194 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Google place ID, when picked from search' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  placeId?: string | null;
}

export class CreateListingDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ example: 'A1' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  unitNumber!: string;

  @ApiProperty({ example: 'Sunny 1BR in Kilimani' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Kilimani, Nairobi' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(160)
  area?: string | null;

  @ApiPropertyOptional({ type: ListingLocationDto, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => ListingLocationDto)
  location?: ListingLocationDto | null;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  bedrooms?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  bathrooms?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxGuests?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  amenities?: string[];

  @ApiProperty({ example: '450000', description: 'Whole shillings in minor units' })
  @Transform(toMinorInputString)
  @IsString()
  nightlyPrice!: string;

  @ApiPropertyOptional({ nullable: true, example: '550000' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(toMinorInputString)
  @IsString()
  weekendPrice?: string | null;

  @ApiPropertyOptional({ example: '100000' })
  @IsOptional()
  @Transform(toMinorInputString)
  @IsString()
  cleaningFee?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Basis points (1000 = 10%)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9000)
  weeklyDiscountBps?: number | null;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  minNights?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  checkInInstructions?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  rulesOverride?: StayRules | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateListingDto {
  @ApiPropertyOptional({ example: 'A1' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  unitNumber?: string;

  @ApiPropertyOptional({ example: 'Sunny 1BR in Kilimani' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Kilimani, Nairobi' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(160)
  area?: string | null;

  @ApiPropertyOptional({ type: ListingLocationDto, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => ListingLocationDto)
  location?: ListingLocationDto | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  bathrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxGuests?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ example: '450000' })
  @IsOptional()
  @Transform(toMinorInputString)
  @IsString()
  nightlyPrice?: string;

  @ApiPropertyOptional({ nullable: true, example: '550000' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(toMinorInputString)
  @IsString()
  weekendPrice?: string | null;

  @ApiPropertyOptional({ example: '100000' })
  @IsOptional()
  @Transform(toMinorInputString)
  @IsString()
  cleaningFee?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Basis points (1000 = 10%)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9000)
  weeklyDiscountBps?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  minNights?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  checkInInstructions?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  rulesOverride?: StayRules | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class ReorderPhotosDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  photoIds!: string[];
}

export class SpecialPriceItemDto {
  @IsDateOnly()
  fromDate!: string;

  @IsDateOnly()
  toDate!: string;

  @ApiProperty({ example: '700000' })
  @Transform(toMinorInputString)
  @IsString()
  nightlyPrice!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  label?: string | null;
}

export class ReplaceSpecialPricesDto {
  @ApiProperty({ type: [SpecialPriceItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SpecialPriceItemDto)
  items!: SpecialPriceItemDto[];
}
