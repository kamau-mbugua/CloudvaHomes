import { createHash } from 'node:crypto';
import { RESERVED_SLUGS, slugProblem } from '../rules/slug.js';

export interface SiteMeta {
  title: string;
  description: string;
  image: string | null;
  url: string;
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function injectMeta(indexHtml: string, m: SiteMeta): string {
  const title = escapeHtml(m.title);
  const description = escapeHtml(m.description);
  const url = escapeHtml(m.url);
  const tags = [
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    ...(m.image ? [`<meta property="og:image" content="${escapeHtml(m.image)}">`] : []),
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n    ');

  let out = indexHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  if (!/<title>/i.test(out)) {
    out = out.replace(/<head>/i, `<head>\n    <title>${title}</title>`);
  }
  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  }
  return `${out}\n${tags}`;
}

export function siteSlugFromHost(host: string, siteDomain: string): string | null {
  const cleanHost = host.trim().toLowerCase().replace(/:\d+$/, '');
  const cleanDomain = siteDomain.trim().toLowerCase().replace(/:\d+$/, '').replace(/^\.+/, '');
  if (!cleanHost || !cleanDomain) return null;
  const suffix = `.${cleanDomain}`;
  if (!cleanHost.endsWith(suffix)) return null;
  const sub = cleanHost.slice(0, cleanHost.length - suffix.length);
  if (!sub || sub.includes('.')) return null;
  if (RESERVED_SLUGS.has(sub)) return null;
  if (slugProblem(sub) !== null) return null;
  return sub;
}

/**
 * Content-Security-Policy for a host booking-site page. Same as the API's helmet default, plus
 * the sha256 of each inline <script> in this exact page (the web app's theme stamp), so it runs
 * without opening `script-src` to 'unsafe-inline'. Hashes come from the HTML being served, so
 * an edit to that script can't silently break the page.
 */
export function siteCsp(html: string): string {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1] ?? '';
    if (body.trim())
      hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return (
    [
      "default-src 'self'",
      "base-uri 'self'",
      "font-src 'self' https: data:",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data:",
      "object-src 'none'",
      `script-src 'self'${hashes.length ? ` ${hashes.join(' ')}` : ''}`,
      "script-src-attr 'none'",
      "style-src 'self' https: 'unsafe-inline'",
      'upgrade-insecure-requests',
    ].join(';') + ';'
  );
}
