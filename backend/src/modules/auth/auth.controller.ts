import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { ok } from '../../common/http/response.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { InvitationsService } from '../users/invitations.service.js';
import {
  AcceptInvitationDto,
  AdminTwoFactorVerifyDto,
  AppConfigQueryDto,
  ChangePasswordDto,
  type ClientKind,
  ForgotPasswordDto,
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  RefreshDto,
  RegisterOrganizationDto,
  ResetPasswordDto,
  StepUpVerifyDto,
  SwitchContextDto,
  SwitchOrgDto,
  UpdateMeDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { authContext, Public, AllowWhenSuspended } from './decorators.js';
import { type IssuedSession, REFRESH_TTL_DAYS, SessionsService } from './sessions.service.js';

export const REFRESH_COOKIE = 'hodi_rt';
const COOKIE_PATH = '/api/v1/auth';

/**
 * Web: the refresh token lives in an httpOnly, SameSite=Strict cookie scoped to /api/v1/auth —
 * page scripts can't read it and cross-site requests never carry it (that, plus same-origin
 * hosting, is the CSRF protection for /auth/refresh and /auth/logout).
 * Mobile (`client: "mobile"`): the token is returned in the body for secure on-device storage.
 */
@ApiTags('Auth')
@AllowWhenSuspended()
@Controller('auth')
export class AuthController {
  private readonly cookie: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly invitations: InvitationsService,
    @Inject(ENV) env: Env,
  ) {
    this.cookie = {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: COOKIE_PATH,
    };
  }

  @Public()
  @Get('app-config')
  async appConfig(@Query() q: AppConfigQueryDto) {
    return ok(await this.auth.appConfig(q.versionCode));
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterOrganizationDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.registerOrganization(dto), dto.client);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.identifier, dto.password);
    if (result.kind === 'two_factor') {
      return ok(result.challenge);
    }
    return this.respond(res, result.session, dto.client);
  }

  @Public()
  @Post('login/2fa')
  @HttpCode(200)
  async verifyAdminTwoFactor(
    @Body() dto: AdminTwoFactorVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(
      res,
      await this.auth.verifyAdminTwoFactor(dto.challengeToken, dto.code),
      dto.client,
    );
  }

  @Public()
  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Body() dto: OtpRequestDto) {
    await this.auth.requestLoginOtp(dto.phone);
    return ok({ sent: true });
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() dto: OtpVerifyDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.verifyLoginOtp(dto.phone, dto.code), dto.client);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!raw) throw AppError.unauthenticated('SESSION_REVOKED', 'Please sign in again');
    try {
      return this.respond(
        res,
        await this.sessions.refresh(raw),
        dto.client ?? (dto.refreshToken ? 'mobile' : 'web'),
      );
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookie);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(
      dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined),
    );
    res.clearCookie(REFRESH_COOKIE, this.cookie);
  }

  @ApiBearerAuth()
  @Post('switch-org')
  @HttpCode(200)
  async switchOrg(@Body() dto: SwitchOrgDto) {
    const ctx = authContext();
    return ok(
      await this.sessions.switchOrg(
        ctx.userId,
        ctx.sessionId,
        dto.organizationId,
        dto.propertyId,
        dto.setAsDefault ?? true,
      ),
    );
  }

  @ApiBearerAuth()
  @Post('switch-context')
  @HttpCode(200)
  async switchContext(@Body() dto: SwitchContextDto) {
    const ctx = authContext();
    return ok(
      await this.sessions.switchContext(ctx.userId, ctx.sessionId, ctx.orgId, {
        organizationId: dto.organizationId,
        propertyId: dto.propertyId,
        tenantId: dto.tenantId,
        landlordId: dto.landlordId,
        setAsDefault: dto.setAsDefault,
      }),
    );
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.identifier);
    return ok({ sent: true });
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.identifier, dto.code, dto.newPassword);
  }

  @Public()
  @Get('invitations/:token')
  async previewInvitation(@Param('token') token: string) {
    return ok(await this.invitations.preview(token));
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.invitations.accept(dto.token, dto.password), dto.client);
  }

  @ApiBearerAuth()
  @Post('step-up/request')
  @HttpCode(202)
  async stepUpRequest() {
    await this.auth.requestStepUp();
    return ok({ sent: true });
  }

  @ApiBearerAuth()
  @Post('step-up/verify')
  @HttpCode(200)
  async stepUpVerify(@Body() dto: StepUpVerifyDto) {
    return ok(await this.auth.verifyStepUp(dto.code));
  }

  private respond(res: Response, session: IssuedSession, client: ClientKind = 'web') {
    if (client === 'mobile') {
      return ok({ ...session.payload, refreshToken: session.refreshToken });
    }
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookie,
      maxAge: REFRESH_TTL_DAYS * 24 * 3600 * 1000,
    });
    return ok(session.payload);
  }
}

@ApiTags('Me')
@ApiBearerAuth()
@AllowWhenSuspended()
@Controller('me')
export class MeController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The session object (without tokens) for the current access token. */
  @Get()
  async me() {
    const ctx = authContext();
    const {
      accessToken: _a,
      accessTokenExpiresAt: _e,
      ...rest
    } = await this.sessions.build(ctx.userId, ctx.orgId, ctx.sessionId);
    return ok(rest);
  }

  @Patch()
  async update(@Body() dto: UpdateMeDto) {
    const ctx = authContext();
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const user = await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
      },
    });
    await this.audit.record({
      action: 'user.profile_update',
      entity: 'user',
      entityId: user.id,
      orgId: null,
      before: { firstName: before.firstName, lastName: before.lastName },
      after: { firstName: user.firstName, lastName: user.lastName },
    });
    return ok({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
    });
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(dto.currentPassword, dto.newPassword);
  }
}
