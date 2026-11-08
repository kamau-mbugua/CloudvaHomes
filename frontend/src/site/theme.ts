/**
 * Host booking-site themes: a preset (the API's THEME_PRESETS) and an optional brand colour.
 * Produces the CSS variables site.css reads (--site-accent, --site-bg, …). White text is used
 * on the main colour everywhere, so a too-pale colour is darkened until it is readable (WCAG AA).
 */

export interface SiteTheme {
  preset: string;
  brandColor: string | null;
}

export const THEME_PRESETS = [
  { key: 'forest', label: 'Forest', accent: '#1f4d3a', bg: '#faf8f5' },
  { key: 'ocean', label: 'Ocean', accent: '#0e6e8c', bg: '#f5f9fb' },
  { key: 'sunset', label: 'Sunset', accent: '#b4400b', bg: '#fdf8f4' },
  { key: 'terracotta', label: 'Terracotta', accent: '#a14b2c', bg: '#fbf7f3' },
  { key: 'plum', label: 'Plum', accent: '#6b2f6b', bg: '#faf7fa' },
  { key: 'charcoal', label: 'Charcoal', accent: '#27272a', bg: '#fafafa' },
] as const;

type Rgb = [number, number, number];

const isHex = (v: string | null | undefined): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => `#${c.map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')).join('')}`;
/** t = 0 → a, t = 1 → b. */
const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb);
};

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

function readable(accent: string): string {
  let c = accent;
  for (let i = 0; i < 20 && contrastWithWhite(c) < 4.5; i++) c = mix(c, '#000000', 0.08);
  return c;
}

export function themeVars(theme: SiteTheme | null | undefined): Record<string, string> {
  const preset = THEME_PRESETS.find((p) => p.key === theme?.preset) ?? THEME_PRESETS[0];
  const custom = isHex(theme?.brandColor);
  const accent = readable(custom ? theme!.brandColor!.toLowerCase() : preset.accent);
  return {
    '--site-accent': accent,
    '--site-accent-dark': mix(accent, '#000000', 0.12),
    '--site-accent-deep': mix(accent, '#000000', 0.3),
    '--site-accent-soft': mix(accent, '#ffffff', 0.9),
    '--site-accent-light': mix(accent, '#ffffff', 0.62),
    '--site-on-accent': '#ffffff',
    '--site-bg': custom ? mix(accent, '#ffffff', 0.97) : preset.bg,
  };
}
