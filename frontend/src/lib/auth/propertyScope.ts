import type { SessionProperty } from './types';

/**
 * The property the whole staff app is narrowed to (`activePropertyId`), or null when it shows
 * every property. Every list, total and report follows it, so the shell shows it on every page.
 */
export function scopedProperty(s: {
  activePropertyId: string | null;
  properties: SessionProperty[];
}): SessionProperty | null {
  if (!s.activePropertyId) return null;
  return s.properties.find((p) => p.id === s.activePropertyId) ?? null;
}

/**
 * What to send to `POST /auth/switch-context` when picking a property. Narrowing is for now
 * only — it is not saved as the property you open on next time, so a quick look at one
 * property can't silently hide the rest after the next sign-in. Showing all properties also
 * clears any default saved earlier.
 */
export function propertySwitchRequest(propertyId: string | null): {
  propertyId: string | null;
  setAsDefault: boolean;
} {
  return propertyId ? { propertyId, setAsDefault: false } : { propertyId: null, setAsDefault: true };
}
