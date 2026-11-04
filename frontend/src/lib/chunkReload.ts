/**
 * Recovery from "stale chunk" failures. Pages are code-split; after a deploy, a tab still
 * running the previous build asks for chunk files that no longer exist and the import
 * rejects. Reloading fetches the new build. A timestamp in session storage stops a reload
 * loop when the failure is something a reload can't fix (e.g. the network is down).
 */

export const CHUNK_RELOAD_KEY = 'kodihub:chunk-reload';
const WINDOW_MS = 5 * 60_000;

const CHUNK_MESSAGES = [
  'failed to fetch dynamically imported module', // Chromium
  'error loading dynamically imported module', // Firefox
  'importing a module script failed', // Safari
];

export function isChunkLoadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ((err as { type?: unknown }).type === 'vite:preloadError') return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  const text = message.toLowerCase();
  return CHUNK_MESSAGES.some((m) => text.includes(m));
}

/** Reloads unless it already did within the last 5 minutes. Returns whether it reloaded. */
export function reloadOnce(
  store: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
  now = Date.now(),
): boolean {
  try {
    const last = Number(store.getItem(CHUNK_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < WINDOW_MS) return false;
    store.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
