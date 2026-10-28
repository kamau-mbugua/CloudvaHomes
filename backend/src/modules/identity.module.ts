import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitService } from '../common/rate-limit/rate-limit.service.js';
import { AuditController } from './audit/audit.controller.js';
import { AuditService } from './audit/audit.service.js';
import { AuthController, MeController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { OtpService } from './auth/otp.service.js';
import { SessionsService } from './auth/sessions.service.js';
import { TokensService } from './auth/tokens.service.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import {
  OrganizationController,
  PlatformOrganizationsController,
} from './organizations/organizations.controller.js';
import { OrganizationsService } from './organizations/organizations.service.js';
import { RolesController } from './roles/roles.controller.js';
import { RolesService } from './roles/roles.service.js';
import { InvitationsService } from './users/invitations.service.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

/**
 * Identity (phase 1): who you are, which organisations you belong to, what you may do there.
 * One module because sign-in, invitations and sessions depend on each other. AuditService and
 * RateLimitService are exported globally for every later feature module.
 */
@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [
    AuthController,
    MeController,
    UsersController,
    RolesController,
    OrganizationController,
    PlatformOrganizationsController,
    AuditController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuditService,
    RateLimitService,
    TokensService,
    SessionsService,
    OtpService,
    AuthService,
    InvitationsService,
    UsersService,
    RolesService,
    OrganizationsService,
  ],
  exports: [AuditService, RateLimitService],
})
export class IdentityModule {}
