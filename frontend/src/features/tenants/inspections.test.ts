import { describe, expect, it } from 'vitest';
import { DEFAULT_AREAS, compareItems, draftFromInspection } from './inspections';

describe('DEFAULT_AREAS', () => {
  it('matches the server and mobile checklist', () => {
    expect(DEFAULT_AREAS).toEqual([
      'Living room', 'Kitchen', 'Bedrooms', 'Bathroom & toilet', 'Doors & locks',
      'Windows & grilles', 'Walls & paint', 'Floors', 'Electrical fittings', 'Plumbing & taps',
    ]);
  });
});

describe('compareItems', () => {
  it('flags areas that got worse and keeps areas only in one inspection', () => {
    expect(compareItems(
      [{ area: 'Kitchen', condition: 'GOOD', photoUploadIds: [] }, { area: 'Floors', condition: 'FAIR', photoUploadIds: [] }],
      [{ area: 'kitchen', condition: 'POOR', photoUploadIds: [] }, { area: 'Balcony', condition: 'GOOD', photoUploadIds: [] }],
    )).toEqual([
      { area: 'Kitchen', before: 'GOOD', after: 'POOR', worse: true },
      { area: 'Floors', before: 'FAIR', after: undefined, worse: false },
      { area: 'Balcony', before: undefined, after: 'GOOD', worse: false },
    ]);
  });
});

describe('draftFromInspection', () => {
  it('starts a new inspection from the default areas, all good', () => {
    const d = draftFromInspection(undefined, '2026-11-04');
    expect(d.inspectedOn).toBe('2026-11-04');
    expect(d.items.map((i) => i.area)).toEqual([...DEFAULT_AREAS]);
    expect(d.items.every((i) => i.condition === 'GOOD' && i.photoUploadIds.length === 0)).toBe(true);
  });

  it('starts a move-out from the move-in areas when there is one', () => {
    const d = draftFromInspection(undefined, '2026-11-04', [{ area: 'Shop floor', condition: 'FAIR', photoUploadIds: ['p'] }]);
    expect(d.items).toEqual([{ area: 'Shop floor', condition: 'GOOD', note: '', photoUploadIds: [] }]);
  });
});
