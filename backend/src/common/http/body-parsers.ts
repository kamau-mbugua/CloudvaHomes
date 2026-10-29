import express, { type RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

/**
 * body-parser failures carry a `type` (e.g. "entity.parse.failed"). Nest's express adapter
 * turns some of them into a bare BadRequestException and loses that type, so the client
 * can't tell "your JSON is broken" from any other 400. Translate them here, first.
 */
export function toBodyParserError(err: unknown): unknown {
  const type = (err as { type?: unknown } | null)?.type;
  switch (type) {
    case 'entity.parse.failed':
      return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    case 'entity.too.large':
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported request encoding');
    default:
      return err;
  }
}

function wrap(parser: RequestHandler): RequestHandler {
  return (req, res, next) =>
    parser(req, res, (err?: unknown) => (err ? next(toBodyParserError(err)) : next()));
}

/** Signed webhooks need the exact bytes that were signed; only these paths keep them. */
const RAW_BODY_PATHS = ['/api/v1/hooks/bank/'];

export type WithRawBody = { rawBody?: Buffer };

export function bodyParsers(limit: string): RequestHandler[] {
  return [
    wrap(
      express.json({
        limit,
        verify: (req, _res, buf) => {
          if (RAW_BODY_PATHS.some((p) => req.url?.startsWith(p))) {
            (req as WithRawBody).rawBody = Buffer.from(buf);
          }
        },
      }),
    ),
    wrap(express.urlencoded({ limit, extended: false })),
  ];
}
