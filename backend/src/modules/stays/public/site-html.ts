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
