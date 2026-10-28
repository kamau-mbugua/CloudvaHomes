import { SetMetadata } from '@nestjs/common';
import { currentContext, type RequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';

export const IS_PUBLIC = 'hodi:isPublic';
export const REQUIRED_PERMISSIONS = 'hodi:permissions';
export const ANY_PERMISSION = 'hodi:anyPermission';
export const REQUIRES_ORG = 'hodi:requiresOrg';
export const PLATFORM_ADMIN_ONLY = 'hodi:platformAdmin';
export const ALLOW_WHEN_SUSPENDED = 'hodi:allowWhenSuspended';

/** No sign-in needed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Caller must act in an organisation and hold ALL of these permissions there. */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Caller must act in an organisation and hold AT LEAST ONE of these permissions. */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSION, permissions);

/** Caller must act in an organisation (any permissions). */
export const RequireOrg = () => SetMetadata(REQUIRES_ORG, true);

export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_ONLY, true);

/**
 * Still allowed while the organisation is SUSPENDED for an unpaid Hodi bill (design §5.4):
 * paying Hodi, signing in, and taking money in — rent collection is never blocked.
 */
export const AllowWhenSuspended = () => SetMetadata(ALLOW_WHEN_SUSPENDED, true);

/** Context of a signed-in caller (throws if called on a public route). */
export function authContext(): RequestContext & { userId: string; sessionId: string } {
  const ctx = currentContext();
  if (!ctx?.userId || !ctx.sessionId) throw AppError.unauthenticated();
  return ctx as RequestContext & { userId: string; sessionId: string };
}

/** Context of a caller acting in an organisation. */
export function orgContext(): RequestContext & {
  userId: string;
  sessionId: string;
  orgId: string;
} {
  const ctx = authContext();
  if (!ctx.orgId)
    throw AppError.forbidden('NO_ACTIVE_ORGANIZATION', 'Choose an organisation first');
  return ctx as RequestContext & { userId: string; sessionId: string; orgId: string };
}

/**
 * For sensitive changes (design §4.4). The client answers 403 STEP_UP_REQUIRED by verifying an
 * OTP and retrying with the `X-Step-Up` header.
 */
export function requireStepUp(): void {
  if (!authContext().stepUpVerified) {
    throw AppError.forbidden(
      'STEP_UP_REQUIRED',
      'Confirm it’s you with a one-time code to continue',
    );
  }
}
