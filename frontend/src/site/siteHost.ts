export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'api',
  'dapi',
  'dev',
  'landing',
  'admin',
  'mail',
  'static',
  'assets',
  'help',
  'support',
  'status',
  'blog',
  'docs',
]);

/**
 * Base domains whose one-label subdomains are host booking sites, most specific first. Checked
 * in the browser at runtime: the deployed web image is built once (no build settings) and
 * serves dev and prod, so the domain can't be baked in. `VITE_SITE_DOMAIN`, when set, is tried
 * first (e.g. a preview domain).
 */
export const SITE_DOMAINS: readonly string[] = ['dev.kodihub.co.ke', 'kodihub.co.ke', 'localhost'];

function cleanDomain(d: string): string {
  return d.trim().toLowerCase().replace(/:\d+$/, '').replace(/^\.+/, '');
}

function defaultDomains(): string[] {
  const extra = import.meta.env?.VITE_SITE_DOMAIN?.trim();
  return extra ? [extra, ...SITE_DOMAINS] : [...SITE_DOMAINS];
}

export function siteSlugFromHost(
  hostname: string,
  siteDomains: string | readonly string[] = defaultDomains(),
): string | null {
  const cleanHost = hostname.trim().toLowerCase().replace(/:\d+$/, '');
  if (!cleanHost) return null;
  const domains = (typeof siteDomains === 'string' ? [siteDomains] : [...siteDomains])
    .map(cleanDomain)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const domain = domains.find((d) => cleanHost.endsWith(`.${d}`));
  if (!domain) return null;
  const sub = cleanHost.slice(0, cleanHost.length - domain.length - 1);
  if (!sub || sub.includes('.')) return null;
  if (RESERVED_SLUGS.has(sub)) return null;
  if (!/^[a-z0-9-]{3,30}$/.test(sub)) return null;
  if (sub.startsWith('-') || sub.endsWith('-')) return null;
  return sub;
}
