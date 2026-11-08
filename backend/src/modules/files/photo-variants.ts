/**
 * Smaller WebP copies of public photos (listing photos, site logos) for the guest site:
 * cards ask for 480 px, the gallery for 1024 px, logos for 160 px. Made on first request and
 * stored next to the original, so photos uploaded before this existed get them too.
 */
export const PHOTO_WIDTHS = [160, 480, 1024] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];

export function photoWidth(raw: string | undefined): PhotoWidth | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return (PHOTO_WIDTHS as readonly number[]).includes(n) ? (n as PhotoWidth) : null;
}

export function photoVariantKey(originalKey: string, width: PhotoWidth): string {
  return `${originalKey}.w${width}.webp`;
}

/** Resizes to `width` (never enlarges), honours EXIF rotation, drops metadata, WebP q78. */
export async function makePhotoVariant(original: Buffer, width: PhotoWidth): Promise<Buffer> {
  // Loaded on first use, not at startup: if the native image library were ever missing, only
  // resizing fails (callers then serve the original) instead of the whole API.
  const { default: sharp } = await import('sharp');
  return sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}
