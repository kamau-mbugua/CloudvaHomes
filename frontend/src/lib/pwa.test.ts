import { describe, expect, it } from 'vitest';
import { PWA_OPTIONS } from '../app/pwa';

describe('PWA_OPTIONS', () => {
  it('asks before updating rather than reloading under the user', () => {
    expect(PWA_OPTIONS.registerType).toBe('prompt');
  });

  it('never serves or caches the API', () => {
    const deny = PWA_OPTIONS.workbox?.navigateFallbackDenylist ?? [];
    expect(deny.some((re) => re.test('/api/v1/tenants'))).toBe(true);
    expect(PWA_OPTIONS.workbox?.runtimeCaching ?? []).toEqual([]);
    expect((PWA_OPTIONS.workbox?.globPatterns ?? []).some((g) => g.includes('json'))).toBe(false);
  });

  it('installs as KodiHQ, full screen from the app root', () => {
    expect(PWA_OPTIONS.manifest).toMatchObject({ name: 'KodiHQ', short_name: 'KodiHQ', start_url: '/', display: 'standalone' });
  });
});
