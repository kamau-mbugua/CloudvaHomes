/** A listing's place on the map, as hosts pick it (Google Places) and guests get it. */
export interface StayLocation {
  address: string;
  lat: number;
  lng: number;
  placeId: string | null;
}

/** The listing's location when it has one (address and coordinates are saved together). */
export function locationOf(l: {
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}): StayLocation | null {
  if (!l.address || l.lat === null || l.lng === null) return null;
  return { address: l.address, lat: l.lat, lng: l.lng, placeId: l.placeId };
}

/** The location with its Google Maps link, as pages and the API show it; null when unset. */
export function locationView(l: Parameters<typeof locationOf>[0]) {
  const loc = locationOf(l);
  return loc ? { ...loc, mapUrl: mapLink(loc) } : null;
}

/** Six decimals (about 10 cm) is plenty; drops trailing zeros. */
function coord(n: number): string {
  return String(Number(n.toFixed(6)));
}

/** A short Google Maps link for SMS (about 45 characters): opens the pin, with directions. */
export function shortMapLink(loc: StayLocation): string {
  return `https://maps.google.com/?q=${coord(loc.lat)},${coord(loc.lng)}`;
}

/** The full Google Maps link for emails and pages: the named place when Google knows it. */
export function mapLink(loc: StayLocation): string {
  const q = `${coord(loc.lat)},${coord(loc.lng)}`;
  return loc.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(loc.placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/**
 * Coordinates from a pasted Google Maps link or "lat, lng" text, for hosts without the map
 * search: "…/@-1.2921,36.8219,17z", "…?q=-1.2921,36.8219", "…!3d-1.2921!4d36.8219" or
 * "-1.2921, 36.8219". Null when none is found or they are out of range.
 */
export function parseCoordinates(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}
