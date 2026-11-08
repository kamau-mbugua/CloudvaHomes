import { LEGAL_DOCS, THEME_PRESETS, legalTemplate } from './legal.js';

describe('stays/rules/legal — starter legal pages for host sites', () => {
  const ctx = {
    businessName: 'Makini Homes',
    contactPhone: '+254727589261',
    siteAddress: 'https://makini.kodihub.co.ke',
  };

  it('has the three pages with plain titles', () => {
    expect(LEGAL_DOCS.map((d) => [d.key, d.title])).toEqual([
      ['terms', 'Terms and Conditions'],
      ['terms-of-use', 'Terms of Use'],
      ['privacy', 'Privacy Policy'],
    ]);
  });

  it.each(['terms', 'terms-of-use', 'privacy'] as const)(
    'fills %s with the host details and leaves no blanks',
    (doc) => {
      const text = legalTemplate(doc, ctx);
      expect(text).toContain('Makini Homes');
      expect(text).toContain('+254727589261');
      expect(text).not.toMatch(/\{\{|\}\}|\[[A-Z ]+\]/);
      expect(text.length).toBeGreaterThan(400);
    },
  );

  it('privacy policy names the Kenyan law and the guest rights', () => {
    const text = legalTemplate('privacy', ctx);
    expect(text).toContain('Data Protection Act, 2019');
    expect(text).toMatch(/correct/i);
    expect(text).toMatch(/delete/i);
  });

  it('works without a phone number', () => {
    expect(
      legalTemplate('terms', { businessName: 'X Stays', contactPhone: null, siteAddress: null }),
    ).toContain('X Stays');
  });

  it('offers six theme presets', () => {
    expect(THEME_PRESETS).toEqual(['forest', 'ocean', 'sunset', 'terracotta', 'plum', 'charcoal']);
  });
});
