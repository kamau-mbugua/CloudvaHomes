import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, setupDocs } from './app.setup.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  // Local convenience only: production config comes from Cloud Run / Secret Manager.
  if (process.env.NODE_ENV !== 'production') {
    try {
      process.loadEnvFile();
    } catch {
      // no .env file — rely on the real environment
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false, // re-registered with explicit limits in configureApp
  });
  configureApp(app);
  setupDocs(app);

  const env = app.get<Env>(ENV);
  await app.listen(env.PORT, '0.0.0.0');
}

await bootstrap();
