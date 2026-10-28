import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, type ErrorDetail } from './app-error.js';

export interface ErrorBody {
  error: { code: string; message: string; details?: ErrorDetail[] };
  requestId: string | null;
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

interface Normalised {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
  headers?: Record<string, string>;
}

// Body-parser failures (bad JSON, body too large) are translated to AppError where the
// parsers are mounted — see common/http/body-parsers.ts.
export function normaliseError(exception: unknown): Normalised {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      details: exception.details,
      headers: exception.headers,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const raw = typeof res === 'string' ? res : (res as { message?: unknown }).message;
    const message = Array.isArray(raw)
      ? raw.join('; ')
      : typeof raw === 'string'
        ? raw
        : exception.message;
    return { status, code: CODE_BY_STATUS[status] ?? `HTTP_${status}`, message };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL',
    message: 'Something went wrong on our side. Please try again.',
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const { status, code, message, details, headers } = normaliseError(exception);

    if (status >= 500) {
      // Internals go to the log (with the request id), never to the client.
      this.logger.error(
        { err: exception, requestId: req.id, path: req.url },
        exception instanceof Error ? exception.message : 'Unhandled non-Error exception',
      );
    }

    const body: ErrorBody = {
      error: details?.length ? { code, message, details } : { code, message },
      requestId: req.id ?? null,
    };
    if (headers) res.set(headers);
    res.status(status).json(body);
  }
}
