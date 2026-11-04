import { describe, expect, it, vi } from 'vitest';
import { CHUNK_RELOAD_KEY, isChunkLoadError, reloadOnce } from './chunkReload';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://app.kodihub.co.ke/assets/UsersPage-abc.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: /assets/x.js',
  ])('recognises the browser message %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('recognises Vite’s preload error event', () => {
    expect(isChunkLoadError({ type: 'vite:preloadError' })).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new TypeError('x is undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Failed')).toBe(false);
  });
});

describe('reloadOnce', () => {
  it('reloads the first time and not again within 5 minutes', () => {
    const store = memoryStore();
    const reload = vi.fn();
    const now = 1_000_000;

    expect(reloadOnce(store, reload, now)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.getItem(CHUNK_RELOAD_KEY)).toBe(String(now));

    expect(reloadOnce(store, reload, now + 60_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(reloadOnce(store, reload, now + 301_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when storage is unavailable (no way to stop a loop)', () => {
    const reload = vi.fn();
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(reloadOnce(broken, reload, 1)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
