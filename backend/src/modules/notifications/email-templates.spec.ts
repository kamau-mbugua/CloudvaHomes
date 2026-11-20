import { describe, expect, it } from 'vitest';
import { renderBrandedEmailHtml } from './email-templates.js';

const WORDMARK = 'kodi<span style="color:#84BD00;">HQ</span>';
const html = (brandName?: string) =>
  renderBrandedEmailHtml({
    subject: 'Rent received',
    text: 'Thank you.',
    ...(brandName ? { brandName } : {}),
  });

describe('branded e-mail layout', () => {
  it('heads the platform’s own e-mails with the two-tone wordmark', () => {
    for (const name of [undefined, 'KodiHQ', ' kodihq ']) {
      expect(html(name)).toContain(WORDMARK);
      expect(html(name)).toContain('Sent by KodiHQ ·');
    }
  });

  it('shows the current name when the sender name is still saved as KodiHub', () => {
    const out = html('KodiHub');
    expect(out).toContain(WORDMARK);
    expect(out).toContain('Sent by KodiHQ ·');
    expect(out).not.toContain('KodiHub');
  });

  it('writes any other sender name out in full', () => {
    const out = html('Makini Homes via KodiHQ');
    expect(out).not.toContain(WORDMARK);
    expect(out).toContain('>Makini Homes via KodiHQ</span>');
    expect(out).toContain('Sent by Makini Homes via KodiHQ ·');
  });
});
