import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyTheme, storedTheme } from './lib/theme';
import { restoreSession } from './lib/auth/session';
import App from './App.tsx';

// index.html already stamped the theme before first paint; this keeps the attribute
// right if that inline script was blocked (e.g. by a strict CSP).
applyTheme(storedTheme());

// Restore the session from the refresh cookie before React mounts, so it happens exactly
// once (StrictMode runs effects twice; a second refresh would reuse a rotated token).
void restoreSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
