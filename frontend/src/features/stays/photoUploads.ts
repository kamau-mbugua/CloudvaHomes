/** A listing holds at most this many photos (the API enforces it too). */
export const MAX_LISTING_PHOTOS = 20;

/** Which picked files to upload, in the order picked, so the listing stays within the limit. */
export function planPhotoUpload<T>(files: readonly T[], existing: number, max = MAX_LISTING_PHOTOS) {
  const room = Math.max(0, max - existing);
  return { accepted: files.slice(0, room), skipped: Math.max(0, files.length - room) };
}

export interface PhotoUploadOutcome {
  added: number;
  failed: { name: string; reason: string }[];
  skipped: number;
}

/** One message for the whole batch. `ok` is false when any upload failed. */
export function photoUploadSummary(o: PhotoUploadOutcome): { ok: boolean; text: string } {
  const parts: string[] = [];
  parts.push(o.added === 0 ? 'No photos added.' : `${o.added} ${o.added === 1 ? 'photo' : 'photos'} added.`);
  if (o.failed.length === 1) {
    parts.push(`${o.failed[0]!.name}: ${o.failed[0]!.reason}`);
  } else if (o.failed.length > 1) {
    parts.push(`${o.failed.length} failed (first: ${o.failed[0]!.name}: ${o.failed[0]!.reason}).`);
  }
  if (o.skipped > 0) {
    parts.push(`${o.skipped} not added: a listing holds up to ${MAX_LISTING_PHOTOS} photos.`);
  }
  return { ok: o.failed.length === 0, text: parts.join(' ') };
}
