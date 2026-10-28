import type { NextFunction, Request, Response } from 'express';
import { emptyContext, runWithContext } from './request-context.js';

/** Opens the AsyncLocalStorage scope for the whole request (guards, handlers, filters). */
export function requestContextMiddleware(
  req: Request & { id?: string },
  _res: Response,
  next: NextFunction,
): void {
  const ctx = emptyContext({
    requestId: typeof req.id === 'string' ? req.id : null,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  });
  runWithContext(ctx, () => next());
}
