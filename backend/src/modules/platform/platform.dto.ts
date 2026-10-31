import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../common/dates/date-only.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { IsPeriod } from '../billing/billing.dto.js';
import { IsMinorAmount } from '../portfolio/money.dto.js';

export class CreatePlanDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsMinorAmount({ description: 'Per occupied unit per month (cents)' }) pricePerUnit!: number;
  @IsMinorAmount({ optional: true, description: 'Monthly minimum (cents)' })
  @IsOptional()
  minimumMonthly?: number;
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsMinorAmount({ optional: true }) @IsOptional() pricePerUnit?: number;
  @IsMinorAmount({ optional: true }) @IsOptional() minimumMonthly?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

const STATUSES = ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CLOSED'] as const;

export class ListOrgsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

/** `null` clears an override or date. */
export class UpdateOrgBillingDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Custom price per unit (cents); null = the plan’s',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  priceOverride?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  minimumOverride?: number | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  trialEndsAt?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  noSuspendUntil?: string | null;

  @ApiPropertyOptional({
    enum: ['ACTIVE', 'CLOSED'],
    description: 'Close an organisation, or reopen it',
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'CLOSED'])
  status?: 'ACTIVE' | 'CLOSED';

  @ApiPropertyOptional({
    nullable: true,
    description: 'Salesperson/operator assigned to this organisation; null clears it',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  onboardedById?: string | null;
}

export class ListPlatformInvoicesDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ enum: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE'] })
  @IsOptional()
  @IsIn(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE'])
  status?: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'OVERDUE';
  @IsPeriod({ optional: true }) @IsOptional() period?: string;
}

export class RunPlatformDto {
  @IsPeriod() period!: string;
}

export class VoidPlatformInvoiceDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class ListPlatformPaymentsDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
}

export class RecordPlatformPaymentDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @IsMinorAmount() amount!: number;
  @ApiProperty({ enum: ['MPESA', 'BANK', 'CHEQUE', 'OTHER'] })
  @IsIn(['MPESA', 'BANK', 'CHEQUE', 'OTHER'])
  method!: 'MPESA' | 'BANK' | 'CHEQUE' | 'OTHER';
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) reference!: string;
  @IsDateOnly() receivedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PlatformSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  dueDays?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  suspendAfterDays?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultPlanId?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Hodi’s paybill' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{5,7}$/, { message: 'paybill must be 5–7 digits' })
  paybill?: string | null;
  @ApiPropertyOptional({ enum: ['SANDBOX', 'PRODUCTION'] })
  @IsOptional()
  @IsIn(['SANDBOX', 'PRODUCTION'])
  darajaEnvironment?: 'SANDBOX' | 'PRODUCTION';
  @ApiPropertyOptional({ description: 'Write-only; needs step-up' })
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
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) passkey?: string;

  // ── Security & Admin 2FA (phase 11) ──
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireAdminTwoFactor?: boolean;
  @ApiPropertyOptional({ enum: ['EMAIL', 'SMS'] })
  @IsOptional()
  @IsIn(['EMAIL', 'SMS'])
  adminTwoFactorChannel?: 'EMAIL' | 'SMS';

  // ── SMS Africa's Talking (phase 11) ──
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  atUsername?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  atSenderId?: string | null;
  @ApiPropertyOptional({ description: 'Write-only Africa’s Talking API key' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  atApiKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() clearAtApiKey?: boolean;

  // ── Signup, Mobile App & Maintenance (phase 11) ──
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowPublicSignup?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  minAppVersionCode?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(30)
  minAppVersionName?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  appUpdateMessage?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  appStoreUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() maintenanceMode?: boolean;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  maintenanceMessage?: string | null;

  // ── System Document Instructions for PDFs (Invoices & Receipts) ──
  @ApiPropertyOptional({
    nullable: true,
    description: 'Platform-wide system instructions printed on all Invoice PDFs',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  invoiceInstructions?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Platform-wide system instructions printed on all Receipt PDFs',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  receiptInstructions?: string | null;
}

export class CreateOperatorDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiProperty({ enum: ['SUPERADMIN', 'SALESPERSON'] })
  @IsIn(['SUPERADMIN', 'SALESPERSON'])
  role!: 'SUPERADMIN' | 'SALESPERSON';
  @ApiPropertyOptional({ minLength: 10 })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password?: string;
}

export class UpdateOperatorDto {
  @ApiPropertyOptional({ enum: ['SUPERADMIN', 'SALESPERSON'], nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['SUPERADMIN', 'SALESPERSON'])
  role?: 'SUPERADMIN' | 'SALESPERSON' | null;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

export class AssignOrganizationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  organizationIds!: string[];
}

export class UpdateEmailSettingsDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  host?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  username?: string | null;

  @ApiPropertyOptional({ enum: ['tls', 'ssl', 'none'] })
  @IsOptional()
  @IsIn(['tls', 'ssl', 'none'])
  encryption?: 'tls' | 'ssl' | 'none';

  @ApiPropertyOptional({ description: 'Write-only SMTP password' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clearPassword?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const match = /^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/.exec(trimmed);
    return match ? match[2]!.trim() : trimmed;
  })
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  fromEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  fromName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  allowlist?: string | null;
}

export class SendTestEmailDto {
  @ApiProperty()
  @IsEmail()
  to!: string;
}

export class SendBroadcastEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(10_000)
  body!: string;
}

export class UpdateEmailTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20_000)
  body?: string;

  @ApiPropertyOptional({ description: 'When true, resets this template to the system default' })
  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}

export class SendTestEmailTemplateDto {
  @ApiProperty()
  @IsEmail()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  body?: string;
}

export class ListEmailLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: ['SENT', 'FAILED'] })
  @IsOptional()
  @IsIn(['SENT', 'FAILED'])
  status?: 'SENT' | 'FAILED';
}

export class ReportDateRangeQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class InvoicesReportQueryDto extends ReportDateRangeQueryDto {
  @ApiPropertyOptional({ enum: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE'] })
  @IsOptional()
  @IsIn(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE'])
  status?: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'OVERDUE';
}

export class PlatformAuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateOnly() from?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateOnly() to?: string;
}

export class BillingPayDto {
  @IsMinorAmount({ description: 'Whole shillings, in cents' }) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

export class LandingHeroStatDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) label!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) value!: string;
}

export class LandingFeatureItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) tag?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(140) title!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) description!: string;
}

export class LandingPortalItemDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(140) title!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) description!: string;
}

export class UpdateLandingPageDto {
  @ApiPropertyOptional({ description: 'When true, resets all landing page content to defaults' })
  @IsOptional()
  @IsBoolean()
  reset?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) brandName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) pageTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) metaDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) signInLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) registerLabel?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) heroBadge?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) heroTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) heroSubtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) heroPrimaryCta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) heroSecondaryCta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) heroStatsTitle?: string;

  @ApiPropertyOptional({ type: [LandingHeroStatDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => LandingHeroStatDto)
  heroStats?: LandingHeroStatDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) featuresTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) featuresSubtitle?: string;

  @ApiPropertyOptional({ type: [LandingFeatureItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => LandingFeatureItemDto)
  features?: LandingFeatureItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) portalsTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) portalsSubtitle?: string;

  @ApiPropertyOptional({ type: [LandingPortalItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => LandingPortalItemDto)
  portals?: LandingPortalItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) pricingBadge?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) pricingTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) pricingSubtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) pricingNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  defaultSliderUnits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  fallbackRatePerUnit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  fallbackMinimumMonthly?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) footerCopyright?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) footerTagline?: string;
}
