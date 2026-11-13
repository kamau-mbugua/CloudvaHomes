/** A listing's place on the map (see backend stays/rules/location.ts). */
export interface StayLocation {
  address: string;
  lat: number;
  lng: number;
  placeId: string | null;
}

function coord(n: number): string {
  return String(Number(n.toFixed(6)));
}

/** The Google Maps link guests get: the named place when Google knows it. */
export function mapLink(loc: StayLocation): string {
  const q = `${coord(loc.lat)},${coord(loc.lng)}`;
  return loc.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(loc.placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** A Maps Embed API iframe address for the pin (needs the browser key). */
export function embedUrl(key: string, loc: Pick<StayLocation, 'lat' | 'lng' | 'placeId'>): string {
  const q = loc.placeId ? `place_id:${loc.placeId}` : `${coord(loc.lat)},${coord(loc.lng)}`;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=16`;
}

/**
 * Coordinates from a pasted Google Maps link or "lat, lng" text: "…/@-1.29,36.82,17z",
 * "…?q=-1.29,36.82", "…!3d-1.29!4d36.82" or "-1.29, 36.82". Null when none are found.
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

/** "Makini Court, Argwings Kodhek Rd" — the place's name in front unless the address has it. */
export function placeAddress(name: string | null | undefined, formatted: string | null | undefined): string {
  const n = name?.trim() ?? '';
  const f = formatted?.trim() ?? '';
  if (!n) return f;
  if (!f || f.toLowerCase().includes(n.toLowerCase())) return f || n;
  return `${n}, ${f}`;
}
