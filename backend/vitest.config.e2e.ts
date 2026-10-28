import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // argon2 hashing + real database round-trips
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // One database shared by all suites: run files one at a time.
    fileParallelism: false,
  },
});
