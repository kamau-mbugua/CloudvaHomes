import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class PublicAvailabilityQueryDto {
  @Matches(DATE_RE, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @Matches(DATE_RE, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}

export class PublicAvailableUnitsQueryDto {
  @Matches(DATE_RE, { message: 'checkIn must be YYYY-MM-DD' })
  checkIn!: string;

  @Matches(DATE_RE, { message: 'checkOut must be YYYY-MM-DD' })
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests: number = 1;
}

export class PublicQuoteDto {
  @Matches(DATE_RE, { message: 'checkIn must be YYYY-MM-DD' })
  checkIn!: string;

  @Matches(DATE_RE, { message: 'checkOut must be YYYY-MM-DD' })
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;
}

export class PublicVerifyPhoneDto {
  @IsString()
  @MaxLength(30)
  phone!: string;
}

export class PublicCreateBookingDto {
  @IsUUID()
  listingId!: string;

  @Matches(DATE_RE, { message: 'checkIn must be YYYY-MM-DD' })
  checkIn!: string;

  @Matches(DATE_RE, { message: 'checkOut must be YYYY-MM-DD' })
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsString()
  @MaxLength(12)
  code!: string;
}

export class PublicBookingPayDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class PublicBookingCancelDto {
  @IsString()
  @MaxLength(12)
  code!: string;
}
