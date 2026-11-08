import { MarkdownEditor } from '../../lib/MarkdownEditor';
import { THEME_PRESETS, themeVars } from '../../site/theme';
import type { HostLegalPage } from './types';

const sectionStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  padding: '1.25rem',
  display: 'grid',
  gap: '1rem',
} as const;

/** Booking-site look: a preset theme and an optional brand colour, with a live preview. */
export function ThemeFields({
  preset,
  brandColor,
  disabled,
  onChange,
}: {
  preset: string;
  brandColor: string;
  disabled: boolean;
  onChange: (next: { preset: string; brandColor: string }) => void;
}) {
  const vars = themeVars({ preset, brandColor: brandColor || null });
  return (
    <section style={sectionStyle}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Look of your booking site</h2>
        <p className="ad__muted" style={{ margin: 0 }}>
          Pick a theme, or use your own brand colour. Text always stays readable.
        </p>
      </div>
      <div role="radiogroup" aria-label="Theme" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        {THEME_PRESETS.map((p) => {
          const active = preset === p.key && !brandColor;
          return (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              className="nx-btn nx-btn--sm"
              style={{ gap: '0.5rem', outline: active ? '2px solid var(--primary)' : undefined, outlineOffset: 2 }}
              onClick={() => onChange({ preset: p.key, brandColor: '' })}
            >
              <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 999, background: p.accent, display: 'inline-block' }} />
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="au__field">
        <div className="au__labelrow">
          <label htmlFor="site-brand-color">Own brand colour (optional)</label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <input
            id="site-brand-color"
            type="color"
            disabled={disabled}
            value={brandColor || vars['--site-accent']}
            onChange={(e) => onChange({ preset, brandColor: e.target.value.toUpperCase() })}
            style={{ width: 48, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 8 }}
          />
          <span className="ad__muted code">{brandColor || 'Using the theme colour'}</span>
          {brandColor ? (
            <button type="button" className="nx-btn nx-btn--sm" disabled={disabled} onClick={() => onChange({ preset, brandColor: '' })}>
              Use theme colour
            </button>
          ) : null}
        </div>
      </div>
      <div
        aria-label="Preview"
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: vars['--site-bg'],
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${vars['--site-accent-deep']}, ${vars['--site-accent-dark']})`,
            color: '#fff',
            padding: '0.9rem 1rem',
            fontWeight: 700,
          }}
        >
          Preview of your site
        </div>
        <div style={{ padding: '0.9rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            style={{
              background: vars['--site-accent'],
              color: vars['--site-on-accent'],
              borderRadius: 8,
              padding: '0.45rem 0.9rem',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            Book now
          </span>
          <span
            style={{
              background: vars['--site-accent-soft'],
              color: vars['--site-accent'],
              borderRadius: 999,
              padding: '0.3rem 0.7rem',
              fontSize: '0.8rem',
            }}
          >
            Kilimani
          </span>
        </div>
      </div>
    </section>
  );
}

const LEGAL_FIELDS = [
  { key: 'terms', label: 'Terms and Conditions', path: '/terms' },
  { key: 'termsOfUse', label: 'Terms of Use', path: '/terms-of-use' },
  { key: 'privacy', label: 'Privacy Policy', path: '/privacy' },
] as const;
export type LegalKey = (typeof LEGAL_FIELDS)[number]['key'];

/** The three legal pages of the booking site. Each starts from a starter text the host can edit. */
export function LegalFields({
  pages,
  values,
  siteAddress,
  disabled,
  onChange,
}: {
  pages: Record<LegalKey, HostLegalPage>;
  values: Record<LegalKey, string>;
  siteAddress: string | null;
  disabled: boolean;
  onChange: (key: LegalKey, text: string) => void;
}) {
  return (
    <section style={sectionStyle}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Legal pages</h2>
        <p className="ad__muted" style={{ margin: 0 }}>
          Shown on your booking site and linked in its footer and at booking. Each page starts from a plain-English
          starter text with your business details. It is not legal advice: read it and change anything that doesn’t
          fit how you work.
        </p>
      </div>
      {LEGAL_FIELDS.map((f) => {
        const page = pages[f.key];
        const isStarter = values[f.key].trim() === page.starter.trim();
        return (
          <div key={f.key} className="au__field">
            <div className="au__labelrow" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label htmlFor={`site-legal-${f.key}`}>
                {f.label}{' '}
                <span className={`ad__badge ${isStarter ? 'ad__badge--warn' : 'ad__badge--ok'}`}>
                  {isStarter ? 'Starter text' : 'Your text'}
                </span>
              </label>
              <span style={{ display: 'flex', gap: '0.4rem' }}>
                {siteAddress ? (
                  <a className="nx-btn nx-btn--sm" href={`${siteAddress}${f.path}`} target="_blank" rel="noreferrer">
                    View ↗
                  </a>
                ) : null}
                {!isStarter ? (
                  <button type="button" className="nx-btn nx-btn--sm" disabled={disabled} onClick={() => onChange(f.key, page.starter)}>
                    Reset to starter text
                  </button>
                ) : null}
              </span>
            </div>
            <MarkdownEditor
              id={`site-legal-${f.key}`}
              maxLength={20000}
              disabled={disabled}
              value={values[f.key]}
              onChange={(text) => onChange(f.key, text)}
            />
          </div>
        );
      })}
    </section>
  );
}
