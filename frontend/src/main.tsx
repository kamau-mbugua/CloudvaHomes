import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyTheme, storedTheme } from './lib/theme';
import { restoreSession } from './lib/auth/session';
import { reloadOnce } from './lib/chunkReload';
import { installTableLabels } from './lib/tableLabels';
import App from './App.tsx';

// index.html already stamped the theme before first paint; this keeps the attribute
// right if that inline script was blocked (e.g. by a strict CSP).
applyTheme(storedTheme());

// After a deploy, an open tab may ask for code files the new build no longer has. Vite
// reports that here; reload once to pick up the new build (ErrorBoundary covers the rest).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce(window.sessionStorage, () => window.location.reload())) event.preventDefault();
});

// Restore the session from the refresh cookie before React mounts, so it happens exactly
// once (StrictMode runs effects twice; a second refresh would reuse a rotated token).
void restoreSession();

// Column names on table cells for the phone card layout (styles/admin.css).
installTableLabels(document.body);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
