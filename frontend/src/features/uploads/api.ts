import { useEffect, useState } from 'react';
import { ApiError, api } from '../../lib/api/client';
import { unwrap } from '../payments/rules';

/**
 * Private files (phase 6): upload first (`POST /uploads` → `{ id }`), then pass the id
 * when saving the expense or reading. Files are only ever read back through the API with
 * the session's token, so they are shown from blob URLs, never plain links.
 */

export type UploadPurpose =
  | 'EXPENSE_RECEIPT'
  | 'METER_PHOTO'
  | 'MAINTENANCE_PHOTO'
  | 'LEASE_DOCUMENT';

export interface Upload {
  id: string;
  purpose: UploadPurpose;
  contentType: string;
  size: number;
  createdAt: string;
}

/** What a form will do with its attachment when it is saved. */
export type AttachmentDraft =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'new'; upload: Upload; file: File };

export async function uploadFile(purpose: UploadPurpose, file: File): Promise<Upload> {
  const body = await api.upload<unknown>('/uploads', { purpose, file });
  return unwrap<Upload>(body);
}

/** Plain-English messages for the upload error codes; anything else gets `fallback`. */
export function uploadErrorMessage(error: unknown, fallback: (error: unknown) => string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'UNSUPPORTED_FILE':
        return 'That file can’t be attached. Use a photo (JPEG, PNG or WebP) or a PDF.';
      case 'FILE_TOO_LARGE':
      case 'PAYLOAD_TOO_LARGE':
        return 'That file is over the 10 MB limit. Try a smaller photo or scan.';
      case 'UPLOAD_INVALID':
        return 'That attachment can’t be used here (it may already be attached to something else). Attach the file again.';
      default:
        break;
    }
  }
  return fallback(error);
}

export type BlobState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; url: string; type: string }
  | { status: 'error'; error: unknown };

/**
 * A private file fetched with the session's token and shown as an object URL. The URL is
 * revoked when the path changes or the component unmounts, so an image never outlives the
 * screen that showed it. `path` null = nothing to fetch.
 */
export function useAuthedBlobUrl(path: string | null): BlobState {
  const [state, setState] = useState<{ path: string | null; value: BlobState }>({ path: null, value: { status: 'idle' } });

  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    let url: string | null = null;
    api.blob(path, undefined, controller.signal)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setState({ path, value: { status: 'ready', url, type: blob.type } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ path, value: { status: 'error', error } });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (!path) return { status: 'idle' };
  // Until the effect for this path answers, it is loading (not the previous path's file).
  return state.path === path ? state.value : { status: 'loading' };
}

/**
 * An object URL for a local file the person just picked, revoked when the file changes or
 * the component unmounts.
 */
export function useLocalFileUrl(file: File | null): string | null {
  const [state, setState] = useState<{ file: File | null; url: string | null }>({ file: null, url: null });

  useEffect(() => {
    if (!file) return undefined;
    // Each run makes and revokes its own URL (so StrictMode's double run is safe); the
    // state is set from a microtask rather than synchronously inside the effect.
    let live = true;
    const url = URL.createObjectURL(file);
    void Promise.resolve().then(() => { if (live) setState({ file, url }); });
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return file && state.file === file ? state.url : null;
}
