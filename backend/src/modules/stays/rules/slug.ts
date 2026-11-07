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

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function slugProblem(raw: string): string | null {
  if (!/^[a-z0-9-]{3,30}$/.test(raw)) {
    return 'Use 3–30 letters, numbers or hyphens';
  }
  if (raw.startsWith('-') || raw.endsWith('-')) {
    return "Can't start or end with a hyphen";
  }
  if (RESERVED_SLUGS.has(raw)) {
    return 'That name is reserved';
  }
  return null;
}
