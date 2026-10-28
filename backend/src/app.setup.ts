import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { AppError, flattenValidationErrors } from './common/errors/app-error.js';
import { HttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { requestContextMiddleware } from './common/context/request-context.middleware.js';
import { bodyParsers } from './common/http/body-parsers.js';
import { bigintJsonReplacer } from './common/http/json-replacer.js';

export const API_PREFIX = 'api/v1';
const BODY_LIMIT = '1mb';

/**
 * Everything that shapes HTTP behaviour lives here so `main.ts` and the e2e tests run the
 * exact same pipeline (prefix, validation, error format, security headers, JSON).
 */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  // Only trust the proxies we actually sit behind; trusting all of X-Forwarded-For would let
  // a client forge its IP and dodge per-IP rate limits. Cloud Run's front end = 1 hop.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('json replacer', bigintJsonReplacer);
  app.use(helmet());
  app.use(cookieParser());
  app.use(...bodyParsers(BODY_LIMIT));
  app.use(requestContextMiddleware);
  app.enableCors({
    origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : false,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  // Internal job endpoints (Cloud Scheduler / Cloud Tasks) will be excluded from this prefix
  // when they arrive, so they can't be reached through the public /api rewrite.
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => AppError.validation(flattenValidationErrors(errors)),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Hodi API')
    .setDescription(
      'Rental-management platform API. Money values are integer minor units (cents); ' +
        'errors use `{ error: { code, message, details }, requestId }`.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupDocs(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  if (!env.ENABLE_DOCS) return;
  SwaggerModule.setup('api/docs', app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: 'api/docs-json',
  });
}
