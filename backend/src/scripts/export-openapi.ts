/**
 * Writes the OpenAPI document to `openapi.json` (or the path given as the first argument)
 * without starting an HTTP server. The web and mobile API clients are generated from it.
 *
 *   npm run build && npm run openapi:export [-- path/to/openapi.json]
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument, configureApp } from '../app.setup.js';

// The document doesn't need a real database; Prisma connects lazily and is never queried.
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  logger: false,
  bodyParser: false,
  // Throw instead of exiting silently (the logger is off), so a bad env shows its message.
  abortOnError: false,
});
configureApp(app);
const out = resolve(process.argv[2] ?? 'openapi.json');
writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
await app.close();
console.log(`OpenAPI document written to ${out}`);
