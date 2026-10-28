import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

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
  @ApiProperty({ example: '0712345678' })
  @IsString()
  @MaxLength(20)
  phone!: string;
}

export class OtpVerifyDto extends ClientDto {
  @ApiProperty({ example: '0712345678' })
  @IsString()
  @MaxLength(20)
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
