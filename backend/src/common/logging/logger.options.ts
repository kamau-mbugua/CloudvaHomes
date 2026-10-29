import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.js';

export const REQUEST_ID_HEADER = 'x-request-id';

// Anything that can carry a secret or personal data. pino replaces matches with "[redacted]".
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.otp',
  '*.code',
  '*.idNumber',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.secrets',
];

// Pino numeric levels → Cloud Logging severities, so logs are filterable by severity in GCP.
const SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/** Accepts a caller-supplied request id only if it looks sane; otherwise mints one. */
export function resolveRequestId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : randomUUID();
}

export function buildLoggerOptions(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      messageKey: 'message',
      formatters: {
        level: (label) => ({ severity: SEVERITY[label] ?? 'DEFAULT', level: label }),
      },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      customProps: (req: IncomingMessage) => {
        // Cloud Run passes "TRACE_ID/SPAN_ID;o=1". Cloud Logging groups a request's log lines
        // under its trace only when the field is the full resource name.
        const trace = req.headers['x-cloud-trace-context'];
        const traceId = typeof trace === 'string' ? trace.split('/')[0] : undefined;
        if (!traceId || !env.GCP_PROJECT_ID) return {};
        return {
          'logging.googleapis.com/trace': `projects/${env.GCP_PROJECT_ID}/traces/${traceId}`,
        };
      },
      // Response headers are the same on every request (security headers) — log the status only.
      serializers: {
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      // Health probes run every few seconds; logging them drowns everything else.
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/v1/health') },
      transport:
        env.LOG_FORMAT === 'pretty'
          ? { target: 'pino-pretty', options: { singleLine: true, messageKey: 'message' } }
          : undefined,
    },
  };
}
