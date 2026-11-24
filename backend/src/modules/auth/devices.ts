/** A readable name for a sign-in's device, from its User-Agent (phase 26: "My devices"). */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (!ua) return 'Unknown device';
  if (ua.startsWith('Dart/') || /KodiHQ/i.test(ua)) return 'KodiHQ app';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iPhone or iPad'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /CrOS/.test(ua)
            ? 'Chromebook'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}
