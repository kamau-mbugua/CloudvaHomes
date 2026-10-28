import { execFileSync } from 'node:child_process';
import { e2eDatabaseUrl } from './e2e-database.js';

/** Applies migrations to the e2e database once per run (CI also runs this explicitly). */
export default function setup(): void {
  try {
    process.loadEnvFile();
  } catch {
    // no .env (CI)
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
  });
}
