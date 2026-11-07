import { describe, expect, it } from 'vitest';
import { siteSlugFromHost } from './siteHost';

describe('site/siteHost — siteSlugFromHost', () => {
  it('extracts valid subdomain slugs for production, dev, and localhost', () => {
    expect(siteSlugFromHost('cozy.dev.kodihub.co.ke', 'dev.kodihub.co.ke')).toBe('cozy');
    expect(siteSlugFromHost('cozy-homes.kodihub.co.ke', 'kodihub.co.ke')).toBe('cozy-homes');
    expect(siteSlugFromHost('cozy.localhost', 'localhost')).toBe('cozy');
    expect(siteSlugFromHost('cozy-homes.localhost:5173', 'localhost')).toBe('cozy-homes');
  });

  it('returns null for reserved names, apex domains, or foreign domains', () => {
    expect(siteSlugFromHost('app.kodihub.co.ke', 'kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('api.kodihub.co.ke', 'kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('evil.com', 'kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('localhost', 'localhost')).toBeNull();
    expect(siteSlugFromHost('kodihub.co.ke', 'kodihub.co.ke')).toBeNull();
  });

  it('recognises host sites at runtime with no build setting, so one web image serves every environment', () => {
    // No second argument: the deployed image is built without VITE_SITE_DOMAIN.
    expect(siteSlugFromHost('review-stays.dev.kodihub.co.ke')).toBe('review-stays');
    expect(siteSlugFromHost('review-stays.kodihub.co.ke')).toBe('review-stays');
    expect(siteSlugFromHost('review-stays.localhost:5173')).toBe('review-stays');
    // The app's own addresses never turn into a guest site.
    expect(siteSlugFromHost('dev.kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('dapi.kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('app.kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('landing.kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('localhost')).toBeNull();
    expect(siteSlugFromHost('a.b.dev.kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('cozy.kodihub.co.ke.evil.com')).toBeNull();
  });
});
