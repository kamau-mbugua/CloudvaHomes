import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * "A new version of KodiHub is ready" — shown when a new build's service worker is waiting.
 * Reloading is the person's choice, so nothing they are typing is lost. Pairs with the
 * stale-chunk recovery in lib/chunkReload.ts.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="upd" role="status">
      <span>A new version of KodiHub is ready.</span>
      <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" className="nx-btn nx-btn--sm" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
