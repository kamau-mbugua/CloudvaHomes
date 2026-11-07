import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyTheme, storedTheme } from './lib/theme';
import { reloadOnce } from './lib/chunkReload';
import { installTableLabels } from './lib/tableLabels';
import { siteSlugFromHost } from './site/siteHost';

// index.html already stamped the theme before first paint; this keeps the attribute
// right if that inline script was blocked (e.g. by a strict CSP).
applyTheme(storedTheme());

// After a deploy, an open tab may ask for code files the new build no longer has. Vite
// reports that here; reload once to pick up the new build (ErrorBoundary covers the rest).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce(window.sessionStorage, () => window.location.reload())) event.preventDefault();
});

// Column names on table cells for the phone card layout (styles/admin.css).
installTableLabels(document.body);

const siteSlug = siteSlugFromHost(window.location.hostname);
const root = createRoot(document.getElementById('root')!);

if (siteSlug) {
  void import('./site/GuestSiteApp.tsx').then(({ default: GuestSiteApp }) => {
    root.render(
      <StrictMode>
        <GuestSiteApp slug={siteSlug} />
      </StrictMode>,
    );
  });
} else {
  void Promise.all([import('./lib/auth/session'), import('./App.tsx')]).then(
    async ([{ restoreSession }, { default: App }]) => {
      await restoreSession();
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    },
  );
}
