import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, safeHref } from './markdownParse';

describe('markdown for host legal pages', () => {
  it('reads headings, paragraphs, lists, quotes and dividers', () => {
    const blocks = parseMarkdown(
      '## 1. Your booking\nA booking is confirmed\nwhen we say so.\n\n- Name\n- Phone\n\n1. First\n2. Second\n\n> Note this\n\n---\n# Title',
    );
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'ul', 'ol', 'quote', 'hr', 'heading']);
    expect(blocks[0]).toMatchObject({
      type: 'heading',
      level: 2,
      text: '1. Your booking',
    });
    expect(blocks[1]).toMatchObject({
      type: 'paragraph',
      text: 'A booking is confirmed when we say so.',
    });
    expect(blocks[2]).toMatchObject({ type: 'ul', items: ['Name', 'Phone'] });
    expect(blocks[3]).toMatchObject({ type: 'ol', items: ['First', 'Second'] });
    expect(blocks[4]).toMatchObject({ type: 'quote', text: 'Note this' });
    expect(blocks[6]).toMatchObject({ level: 1, text: 'Title' });
  });

  it('reads bold, italic, code and links inside a line', () => {
    expect(parseInline('Pay **on time**, *please*, use `M-Pesa` or [call us](tel:+254700000000).')).toEqual([
      { t: 'text', v: 'Pay ' },
      { t: 'strong', v: 'on time' },
      { t: 'text', v: ', ' },
      { t: 'em', v: 'please' },
      { t: 'text', v: ', use ' },
      { t: 'code', v: 'M-Pesa' },
      { t: 'text', v: ' or ' },
      { t: 'link', v: 'call us', href: 'tel:+254700000000' },
      { t: 'text', v: '.' },
    ]);
  });

  it('never lets a link run script, and keeps HTML as plain text', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(safeHref('/privacy')).toBe('/privacy');
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ t: 'text', v: '[x](javascript:alert(1))' }]);
    expect(parseMarkdown('<script>alert(1)</script>')).toEqual([
      { type: 'paragraph', text: '<script>alert(1)</script>' },
    ]);
  });
});
