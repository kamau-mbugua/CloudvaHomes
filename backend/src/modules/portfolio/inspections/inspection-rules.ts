/**
 * Move-in / move-out inspections (phase 13): a checklist of areas, each with a condition,
 * an optional note and up to 6 photos. Pure rules shared by the service and its tests;
 * the web and mobile apps mirror DEFAULT_AREAS.
 */

export const DEFAULT_AREAS = [
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
] as const;

export const CONDITIONS = ['GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
export type ItemCondition = (typeof CONDITIONS)[number];

export interface InspectionItem {
  area: string;
  condition: string;
  note?: string;
  photoUploadIds: string[];
}

export const MAX_AREAS = 30;
export const MAX_PHOTOS = 6;

/** Null when fine, else the first problem in words. */
export function checkItems(items: readonly InspectionItem[]): string | null {
  if (items.length > MAX_AREAS) return `At most ${MAX_AREAS} areas.`;
  const seen = new Set<string>();
  for (const i of items) {
    const area = i.area.trim();
    if (!area) return 'Every area needs a name.';
    const key = area.toLowerCase();
    if (seen.has(key)) return `${area} is listed twice.`;
    seen.add(key);
    if (i.photoUploadIds.length > MAX_PHOTOS) return `At most ${MAX_PHOTOS} photos for ${area}.`;
  }
  return null;
}

export function photoIdsOf(items: readonly InspectionItem[]): string[] {
  return [...new Set(items.flatMap((i) => i.photoUploadIds))];
}
