import type { ValidationError } from 'class-validator';

export interface ErrorDetail {
  field?: string;
  message: string;
}

/**
 * A failure the client is meant to understand. `code` is a stable, SCREAMING_SNAKE
 * identifier clients may branch on; `message` is human-readable and may change.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
    /** Extra response headers, e.g. Retry-After on 429. */
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(what = 'Resource'): AppError {
    return new AppError(404, 'NOT_FOUND', `${what} not found`);
  }

  static conflict(message: string, code = 'CONFLICT'): AppError {
    return new AppError(409, code, message);
  }

  static validation(details: ErrorDetail[]): AppError {
    return new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', details);
  }

  static fieldInvalid(field: string, message: string): AppError {
    return AppError.validation([{ field, message }]);
  }

  static unauthenticated(code = 'UNAUTHENTICATED', message = 'Please sign in'): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(
    code = 'PERMISSION_DENIED',
    message = "You don't have permission to do that",
  ): AppError {
    return new AppError(403, code, message);
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    const wait = retryAfterSeconds < 90 ? `${retryAfterSeconds} seconds` : `${minutes} minutes`;
    return new AppError(
      429,
      'RATE_LIMITED',
      `Too many attempts. Try again in ${wait}.`,
      undefined,
      {
        'Retry-After': String(retryAfterSeconds),
      },
    );
  }
}

/** Flattens class-validator's nested tree into `{ field: "a.b[0].c", message }` rows. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((e) => {
    const field = /^\d+$/.test(e.property)
      ? `${parent}[${e.property}]`
      : parent
        ? `${parent}.${e.property}`
        : e.property;
    const own = Object.values(e.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flattenValidationErrors(e.children ?? [], field)];
  });
}
