/**
 * Canonical "Ledger roof, refined" (C2.1 · Original) brand mark and wordmark components.
 *
 * - Primary mark (`viewBox="0 0 48 48"`): Roof chevron (`M6 20 24 6l18 14`) over three
 *   left-aligned ledger lines (rent, utilities, and a shorter third bar in #84BD00 lime
 *   representing the cleared balance).
 * - Wordmark: Lowercase `kodihub` in Lufga SemiBold (600), -0.04em tracking, split into
 *   `kodi` + `hub`.
 */

export type BrandTone = 'light' | 'navy' | 'ink' | 'lime';

export function BrandIcon({
  tone = 'light',
  size = 28,
  animated = false,
  className,
}: {
  /** Surface context: 'light' = on paper/white, 'navy' = on #002b4d, 'ink' = one-colour, 'lime' = on #84bd00. */
  tone?: BrandTone;
  size?: number;
  /** Animates the 3 ledger bars sequentially (`kh-bar-1..3`). */
  animated?: boolean;
  className?: string;
}) {
  const mainColor =
    tone === 'navy'
      ? '#ffffff'
      : tone === 'ink'
        ? '#0a2540'
        : '#002b4d';

  const bar3Color =
    tone === 'ink'
      ? '#0a2540'
      : tone === 'lime'
        ? '#ffffff'
        : '#84bd00';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M6 20 24 6l18 14"
        fill="none"
        stroke={mainColor}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        className={animated ? 'kh-bar-1' : undefined}
        x="12"
        y="24"
        width="24"
        height="4.4"
        rx="2.2"
        fill={mainColor}
      />
      <rect
        className={animated ? 'kh-bar-2' : undefined}
        x="12"
        y="31.5"
        width="17"
        height="4.4"
        rx="2.2"
        fill={mainColor}
      />
      <rect
        className={animated ? 'kh-bar-3' : undefined}
        x="12"
        y="39"
        width="10"
        height="4.4"
        rx="2.2"
        fill={bar3Color}
      />
    </svg>
  );
}

export function BrandWordmark({
  tone = 'light',
  size = 19,
  className,
}: {
  tone?: BrandTone;
  size?: number;
  className?: string;
}) {
  const kodiColor =
    tone === 'navy'
      ? '#ffffff'
      : tone === 'ink'
        ? '#0a2540'
        : '#002b4d';

  const hubColor =
    tone === 'navy'
      ? '#84bd00'
      : tone === 'ink'
        ? '#0a2540'
        : tone === 'lime'
          ? '#ffffff'
          : '#4d6b10';

  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font)',
        fontSize: `${size}px`,
        fontWeight: 600,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'baseline',
      }}
    >
      <span style={{ color: kodiColor }}>kodi</span>
      <span style={{ color: hubColor }}>hub</span>
    </span>
  );
}

export function BrandLockup({
  tone = 'light',
  size = 'md',
  animated = false,
  className,
}: {
  tone?: BrandTone;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}) {
  const dims = {
    xs: { icon: 20, text: 14, gap: 6 },
    sm: { icon: 26, text: 18, gap: 8 },
    md: { icon: 32, text: 21, gap: 10 },
    lg: { icon: 42, text: 26, gap: 12 },
  }[size];

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${dims.gap}px`,
      }}
    >
      <BrandIcon tone={tone} size={dims.icon} animated={animated} />
      <BrandWordmark tone={tone} size={dims.text} />
    </span>
  );
}
