/**
 * Files people attach (receipts, meter photos) and files the app hands back (CSV exports).
 *
 * The server is the authority on what may be uploaded — it sniffs the file's first bytes —
 * so the checks here only spare a person a slow upload that would be refused anyway.
 */

/** What the API stores: JPEG, PNG, WebP and PDF (docs/plans phase 6). */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 10 MB, the API's limit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/**
 * The file's type as the browser reports it, or guessed from its extension when the
 * browser reports none (some Android pickers do that).
 */
export function fileTypeOf(file: { name: string; type: string }): string {
  if (file.type) return file.type.toLowerCase();
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  return EXTENSION_TYPES[ext] ?? '';
}

export type FileCheck = { ok: true; type: string } | { ok: false; error: string };

/** Whether a picked file is worth uploading: an allowed type and at most 10 MB. */
export function checkUploadFile(
  file: { name: string; type: string; size: number },
  allowed: readonly string[] = RECEIPT_TYPES,
): FileCheck {
  const type = fileTypeOf(file);
  if (!allowed.includes(type)) {
    const pdf = allowed.includes('application/pdf');
    return {
      ok: false,
      error: pdf
        ? 'Choose a photo (JPEG, PNG or WebP) or a PDF.'
        : 'Choose a photo (JPEG, PNG or WebP).',
    };
  }
  if (file.size <= 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `That file (${formatBytes(file.size)}) is over the 10 MB limit. Try a smaller photo or scan.` };
  }
  return { ok: true, type };
}

export function isImageType(type: string | null | undefined): boolean {
  return Boolean(type && type.toLowerCase().startsWith('image/'));
}

/** 2048 → "2 KB"; 1572864 → "1.5 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${trimOne(kb)} KB`;
  return `${trimOne(kb / 1024)} MB`;
}

function trimOne(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** One part of a file name, made safe: "Profit & loss" → "profit-loss". */
export function fileSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "expenses" + ["2026-10-01", "2026-10-31"] → "expenses-2026-10-01-to-2026-10-31.csv". */
export function csvFilename(report: string, range: { from?: string; to?: string; asOf?: string; extra?: string } = {}): string {
  const parts = [fileSlug(report)];
  if (range.extra) parts.push(fileSlug(range.extra));
  if (range.from || range.to) parts.push(`${range.from || 'start'}-to-${range.to || 'today'}`);
  else if (range.asOf) parts.push(range.asOf);
  return `${parts.filter(Boolean).join('-')}.csv`;
}

/** Saves a fetched blob as a download. The object URL is revoked once the save has started. */
export function saveBlob(blob: Blob, filename: string, fallbackType = 'application/octet-stream'): void {
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: fallbackType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
