import { useSyncExternalStore } from 'react';

/**
 * Light or dark, chosen by the person — not by their OS. Ported from pos-react's
 * src/lib/theme.ts.
 *
 * Default is LIGHT: the product stamps its own appearance and offers dark as an opt-out,
 * so screenshots, demos and support tickets look the same on every machine. Per device,
 * not per account — the choice belongs to the screen in front of you.
 *
 * Kept in lockstep with the inline script in index.html: same key, same default.
 *
 * A tiny external store, because two controls (the top-bar toggle and the account menu's
 * Appearance switch) show the same setting and must not disagree.
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'hodi.theme';

/** What is stored, or the default. Never throws — private mode can refuse localStorage. */
export function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Always sets the attribute, which stops tokens.css's prefers-color-scheme rule deciding. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

let current: Theme | null = null;
const listeners = new Set<() => void>();

function read(): Theme {
  if (current === null) current = storedTheme();
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  applyTheme(theme);

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Still applies for this session; it just will not survive a reload.
  }

  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, read, () => 'light' as Theme);
  return [theme, setTheme];
}
