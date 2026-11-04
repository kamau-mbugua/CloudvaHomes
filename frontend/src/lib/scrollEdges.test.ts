import { describe, expect, it } from 'vitest';
import { scrollEdges } from './scrollEdges';

describe('scrollEdges', () => {
  it('shows no fade when everything fits', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 390, clientWidth: 390 })).toEqual({ start: false, end: false });
  });

  it('fades the end when more tabs are off to the right', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 520, clientWidth: 390 })).toEqual({ start: false, end: true });
  });

  it('fades both sides in the middle', () => {
    expect(scrollEdges({ scrollLeft: 60, scrollWidth: 520, clientWidth: 390 })).toEqual({ start: true, end: true });
  });

  it('fades only the start once scrolled to the end, allowing sub-pixel rounding', () => {
    expect(scrollEdges({ scrollLeft: 129.6, scrollWidth: 520, clientWidth: 390 })).toEqual({ start: true, end: false });
  });
});
