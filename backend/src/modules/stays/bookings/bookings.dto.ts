import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../../common/http/pagination.js';
import type { BookingStatus } from '../../../generated/prisma/client.js';

const BOOKING_STATUSES: readonly BookingStatus[] = [
  'HELD',
  'REQUESTED',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'EXPIRED',
  'DECLINED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export class QuoteBookingDto {
  @IsUUID()
  listingId!: string;

  @IsDateOnly()
  checkIn!: string;

  @IsDateOnly()
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guests!: number;
}

export class BookingGuestInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}

export class CreateHostBookingDto {
  @IsUUID()
  listingId!: string;

  @IsDateOnly()
  checkIn!: string;

  @IsDateOnly()
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guests!: number;

  @ValidateNested()
  @Type(() => BookingGuestInputDto)
  guest!: BookingGuestInputDto;

  @IsOptional()
  @IsString()
  total?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class CreateBlockDto {
  @IsUUID()
  unitId!: string;

  @IsDateOnly()
  from!: string;

  @IsDateOnly()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DeclineBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Why the host is giving up on what a guest still owes (kept on the booking and in the audit log). */
export class WriteOffBalanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  refund?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatus;

  @IsOptional()
  @IsDateOnly({ optional: true })
  from?: string;

  @IsOptional()
  @IsDateOnly({ optional: true })
  to?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CalendarQueryDto {
  @IsDateOnly()
  from!: string;

  @IsDateOnly()
  to!: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;
}
