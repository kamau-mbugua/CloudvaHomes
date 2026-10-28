/**
 * The database e2e tests run against. Every suite TRUNCATEs all tables, so refuse anything
 * whose name doesn't say it's a test database — a missing TEST_DATABASE_URL must never wipe
 * hodi_dev.
 */
export function e2eDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set TEST_DATABASE_URL for e2e tests');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run e2e tests against database "${name}": they erase every table. ` +
        'Set TEST_DATABASE_URL to a database whose name contains "test" (e.g. hodi_test).',
    );
  }
  return url;
}
