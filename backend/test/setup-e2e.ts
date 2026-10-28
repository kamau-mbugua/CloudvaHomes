import 'dotenv/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { e2eDatabaseUrl } from './e2e-database.js';

// e2e runs against a real Postgres — always a dedicated test database (see e2e-database.ts).
process.env.DATABASE_URL = e2eDatabaseUrl();
process.env.NODE_ENV = 'test';
// Uploaded test files go to the OS temp folder, never the repository.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = join(tmpdir(), 'hodi-e2e-storage');
// .env (loaded above) usually sets LOG_LEVEL=debug for local dev; tests stay quiet unless asked.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
