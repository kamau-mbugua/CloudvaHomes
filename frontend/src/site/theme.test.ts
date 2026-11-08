import { describe, expect, it } from 'vitest';
import { THEME_PRESETS, contrastWithWhite, themeVars } from './theme';

describe('host site themes', () => {
  it('has the six presets the API accepts, each readable with white text', () => {
    expect(THEME_PRESETS.map((p) => p.key)).toEqual(['forest', 'ocean', 'sunset', 'terracotta', 'plum', 'charcoal']);
    for (const p of THEME_PRESETS) expect(contrastWithWhite(p.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('Forest gives the current look', () => {
    const v = themeVars({ preset: 'forest', brandColor: null });
    expect(v['--site-accent']).toBe('#1f4d3a');
    expect(v['--site-bg']).toBe('#faf8f5');
    expect(v['--site-on-accent']).toBe('#ffffff');
  });

  it('uses the host colour and derives the other shades from it', () => {
    const v = themeVars({ preset: 'forest', brandColor: '#0E7490' });
    expect(v['--site-accent']).toBe('#0e7490');
    expect(v['--site-accent-soft']).not.toBe(v['--site-accent']);
    expect(contrastWithWhite(v['--site-accent-deep'])).toBeGreaterThan(contrastWithWhite(v['--site-accent']));
  });

  it('darkens a pale brand colour until white text on it is readable', () => {
    const v = themeVars({ preset: 'forest', brandColor: '#FACC15' });
    expect(contrastWithWhite(v['--site-accent'])).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back to Forest for an unknown preset or a broken colour', () => {
    expect(themeVars({ preset: 'neon', brandColor: 'green' })['--site-accent']).toBe('#1f4d3a');
    expect(themeVars(undefined)['--site-accent']).toBe('#1f4d3a');
  });
});
