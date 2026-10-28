import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiOrigin = env.VITE_DEV_API_ORIGIN || 'http://localhost:8080';

  return {
    plugins: [react()],

    server: {
      port: 5173,
      strictPort: true,
      // Proxy rather than CORS: the browser makes same-origin requests, which is also
      // what production looks like (Firebase Hosting rewrites /api/** to Cloud Run).
      proxy: {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
    },

    // Node environment, no jsdom: only pure modules are tested (navigation matching, the
    // API client's error parsing, money formatting) — that is where a wrong answer hides.
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
