import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const CLIENTS = ['web', 'mobile'] as const;
export type ClientKind = (typeof CLIENTS)[number];

class ClientDto {
  @ApiPropertyOptional({
    enum: CLIENTS,
    default: 'web',
    description: 'mobile → refresh token returned in the body instead of an httpOnly cookie',
  })
  @IsOptional()
  @IsIn(CLIENTS)
  client?: ClientKind;
}

export class AppConfigQueryDto {
  @ApiPropertyOptional({
    description: 'Current mobile app build/version code for force-update check',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  versionCode?: number;
}

export class RegisterOrganizationDto extends ClientDto {
  @ApiProperty({ example: 'Sunrise Apartments' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName!: string;

  @ApiPropertyOptional({ enum: ['LANDLORD', 'AGENCY'], default: 'LANDLORD' })
  @IsOptional()
  @IsIn(['LANDLORD', 'AGENCY'])
  organizationKind?: 'LANDLORD' | 'AGENCY';

  @ApiProperty({ example: '0712345678' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @ApiProperty({ example: 'owner@example.com' })
  @IsString()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: 'A012345678Z' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]\d{9}[A-Za-z]$/, {
    message: 'KRA PIN must be 11 characters, e.g. A012345678Z',
  })
  kraPin?: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Wanjiku' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class LoginDto extends ClientDto {
  @ApiProperty({ example: 'owner@example.com', description: 'Email or phone number' })
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  identifier!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class OtpRequestDto {
  @ApiProperty({ example: '0712345678', description: 'Email address or phone number' })
  @IsString()
  @MaxLength(254)
  phone!: string;
}

export class OtpVerifyDto extends ClientDto {
  @ApiProperty({ example: '0712345678', description: 'Email address or phone number' })
  @IsString()
  @MaxLength(254)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class RefreshDto extends ClientDto {
  @ApiPropertyOptional({ description: 'Mobile only; web uses the httpOnly cookie' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class SwitchOrgDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email or phone number' })
  @IsString()
  @MaxLength(254)
  identifier!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(254)
  identifier!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MaxLength(128)
  newPassword!: string;
}

export class AcceptInvitationDto extends ClientDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  token!: string;

  @ApiPropertyOptional({ description: 'Required if the account has no password yet' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class StepUpVerifyDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class AdminTwoFactorVerifyDto extends ClientDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(1024)
  challengeToken!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MaxLength(128)
  newPassword!: string;
}
