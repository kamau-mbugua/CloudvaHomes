/**
 * Where to go after signing in. Only same-app paths are honoured: `next` comes from the
 * address bar, so `//evil.example` or `https://…` must not turn sign-in into an open
 * redirect.
 */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // The sign-in screens themselves are never a useful destination.
  if (/^\/(login|forgot-password|reset-password|invite)(\/|\?|$)/.test(next)) return fallback;
  return next;
}

/** `/login?next=…` for the page the person was trying to reach. */
export function loginPath(from: string): string {
  return from && from !== '/' && from !== '/app' ? `/login?next=${encodeURIComponent(from)}` : '/login';
}
