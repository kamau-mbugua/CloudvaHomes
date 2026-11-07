import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { injectMeta, siteCsp, siteSlugFromHost } from './site-html.js';

describe('site-html — injectMeta and siteSlugFromHost', () => {
  it('escapes HTML characters in title, description, image, and url, and omits og:image when image is null', () => {
    const base =
      '<!doctype html><html><head><title>KodiHub</title></head><body><div id="root"></div></body></html>';

    const withImg = injectMeta(base, {
      title: 'Cozy "<script>alert(1)</script>',
      description: 'Best & brightest stay > all',
      image: 'https://cozy.kodihub.co.ke/api/v1/public/photos/p1',
      url: 'https://cozy.kodihub.co.ke/u/l1',
    });

    expect(withImg).toContain('<title>Cozy &quot;&lt;script&gt;alert(1)&lt;/script&gt;</title>');
    expect(withImg).toContain(
      'property="og:title" content="Cozy &quot;&lt;script&gt;alert(1)&lt;/script&gt;"',
    );
    expect(withImg).toContain(
      'property="og:description" content="Best &amp; brightest stay &gt; all"',
    );
    expect(withImg).toContain(
      'property="og:image" content="https://cozy.kodihub.co.ke/api/v1/public/photos/p1"',
    );
    expect(withImg).toContain('property="og:url" content="https://cozy.kodihub.co.ke/u/l1"');
    expect(withImg).toContain('name="twitter:card" content="summary_large_image"');
    expect(withImg).not.toContain('<script>');

    const withoutImg = injectMeta(base, {
      title: 'Plain Stay',
      description: 'Nice stay',
      image: null,
      url: 'https://plain.kodihub.co.ke/',
    });
    expect(withoutImg).not.toContain('og:image');
  });

  it('extracts valid subdomain slugs and rejects reserved names or foreign domains', () => {
    expect(siteSlugFromHost('cozy.dev.kodihub.co.ke', 'dev.kodihub.co.ke')).toBe('cozy');
    expect(siteSlugFromHost('cozy-homes.kodihub.co.ke:443', 'kodihub.co.ke')).toBe('cozy-homes');
    expect(siteSlugFromHost('app.kodihub.co.ke', 'kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('api.kodihub.co.ke', 'kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('evil.com', 'kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('kodihub.co.ke', 'kodihub.co.ke')).toBeNull();
    expect(siteSlugFromHost('sub.cozy.kodihub.co.ke', 'kodihub.co.ke')).toBeNull();
  });

  it('siteCsp keeps the strict policy but allows exactly the inline scripts in the page', () => {
    const body =
      "\n      (function () { document.documentElement.setAttribute('data-theme', 'light'); })();\n    ";
    const html = `<!doctype html><html><head><script>${body}</script><script type="module" src="/assets/app.js"></script></head></html>`;
    const hash = createHash('sha256').update(body, 'utf8').digest('base64');
    const csp = siteCsp(html);
    expect(csp).toContain(`script-src 'self' 'sha256-${hash}'`);
    expect(csp).not.toContain("unsafe-inline'; script");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(siteCsp('<html><head></head></html>')).toContain("script-src 'self';");
  });
});
