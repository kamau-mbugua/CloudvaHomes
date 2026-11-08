import { describe, expect, it } from 'vitest';
import { applyMarkdownFormat } from './markdownFormat';

describe('markdown toolbar', () => {
  it('wraps the selection in bold or italic', () => {
    expect(applyMarkdownFormat('pay on time', 4, 11, 'bold')).toEqual({
      value: 'pay **on time**',
      start: 6,
      end: 13,
    });
    expect(applyMarkdownFormat('pay on time', 4, 11, 'italic')).toEqual({
      value: 'pay *on time*',
      start: 5,
      end: 12,
    });
  });

  it('inserts a placeholder when nothing is selected', () => {
    expect(applyMarkdownFormat('Hi ', 3, 3, 'bold')).toEqual({
      value: 'Hi **bold text**',
      start: 5,
      end: 14,
    });
  });

  it('turns the selected lines into a heading or a list', () => {
    expect(applyMarkdownFormat('Intro\nYour booking\nMore', 6, 18, 'heading').value).toBe(
      'Intro\n## Your booking\nMore',
    );
    expect(applyMarkdownFormat('Name\nPhone', 0, 10, 'bullets').value).toBe('- Name\n- Phone');
    expect(applyMarkdownFormat('Name\nPhone', 0, 10, 'numbers').value).toBe('1. Name\n2. Phone');
  });

  it('makes a link from the selection, selecting the address to type over', () => {
    const r = applyMarkdownFormat('call us', 0, 7, 'link');
    expect(r.value).toBe('[call us](https://)');
    expect(r.value.slice(r.start, r.end)).toBe('https://');
  });
});
