import { describe, expect, it } from 'vitest';
import { loginPath, safeNext } from './next';

describe('safeNext', () => {
  it('keeps in-app paths', () => {
    expect(safeNext('/app/settings/users?page=2')).toBe('/app/settings/users?page=2');
  });

  it('refuses anything that could leave the app', () => {
    expect(safeNext('//evil.example')).toBe('/app');
    expect(safeNext('/\\evil.example')).toBe('/app');
    expect(safeNext('https://evil.example')).toBe('/app');
    expect(safeNext(null)).toBe('/app');
  });

  it('does not send people back to a sign-in screen', () => {
    expect(safeNext('/login?next=/app')).toBe('/app');
    expect(safeNext('/invite/abc')).toBe('/app');
  });
});

describe('loginPath', () => {
  it('carries the page being opened', () => {
    expect(loginPath('/app/units?q=a')).toBe('/login?next=%2Fapp%2Funits%3Fq%3Da');
    expect(loginPath('/app')).toBe('/login');
  });
});
