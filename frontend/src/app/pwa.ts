import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * Installable web app (phase 13). The service worker only precaches the app shell (code,
 * styles, fonts, icons): `/api/*` is never cached or answered by it, so money figures are
 * always live. A new build waits for the person to choose "Reload" (UpdatePrompt).
 */
export const PWA_OPTIONS: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'KodiHub',
    short_name: 'KodiHub',
    description: 'Rent, invoices, M-Pesa payments and statements for landlords, agencies and tenants.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fafaf7',
    theme_color: '#002b4d',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    globPatterns: ['**/*.{js,css,html,svg,woff2,png,ico}'],
    runtimeCaching: [],
    cleanupOutdatedCaches: true,
  },
};
