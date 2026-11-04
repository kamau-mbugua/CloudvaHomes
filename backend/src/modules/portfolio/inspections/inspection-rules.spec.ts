import { describe, expect, it } from 'vitest';
import { DEFAULT_AREAS, checkItems, photoIdsOf } from './inspection-rules.js';

const item = (
  over: Partial<{ area: string; condition: string; note: string; photoUploadIds: string[] }> = {},
) => ({
  area: 'Kitchen',
  condition: 'GOOD',
  photoUploadIds: [],
  ...over,
});

describe('inspection rules', () => {
  it('has the standard checklist areas', () => {
    expect(DEFAULT_AREAS).toEqual([
      'Living room',
      'Kitchen',
      'Bedrooms',
      'Bathroom & toilet',
      'Doors & locks',
      'Windows & grilles',
      'Walls & paint',
      'Floors',
      'Electrical fittings',
      'Plumbing & taps',
    ]);
  });

  it('accepts up to 30 areas with up to 6 photos each', () => {
    expect(
      checkItems(Array.from({ length: 30 }, (_, i) => item({ area: `Area ${i}` }))),
    ).toBeNull();
    expect(checkItems(Array.from({ length: 31 }, (_, i) => item({ area: `Area ${i}` })))).toBe(
      'At most 30 areas.',
    );
    expect(checkItems([item({ photoUploadIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })])).toBe(
      'At most 6 photos for Kitchen.',
    );
  });

  it('needs each area named once', () => {
    expect(checkItems([item(), item()])).toBe('Kitchen is listed twice.');
    expect(checkItems([item({ area: '  ' })])).toBe('Every area needs a name.');
  });

  it('collects every photo id once', () => {
    expect(
      photoIdsOf([
        item({ photoUploadIds: ['a', 'b'] }),
        item({ area: 'Floors', photoUploadIds: ['b', 'c'] }),
      ]),
    ).toEqual(['a', 'b', 'c']);
  });
});
