import { ApiError, errorMessage } from '../../lib/api/client';

/**
 * Sign-in failures in words a person can act on. The server's message is used where it
 * carries something specific (a rate limit says when to try again).
 */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return 'That email or phone number and password do not match. Check both and try again.';
      case 'INVALID_CODE':
        return 'That code is wrong or has expired. Check the latest message, or send a new code.';
      case 'RATE_LIMITED':
        return error.message || 'Too many attempts. Wait a little and try again.';
      case 'INVITATION_INVALID':
        return 'This invitation link has expired or has already been used. Ask whoever invited you to send a new one.';
      case 'SESSION_REVOKED':
      case 'TOKEN_EXPIRED':
        return 'Your session ended. Sign in again.';
      default:
        break;
    }
  }
  return errorMessage(error);
}
