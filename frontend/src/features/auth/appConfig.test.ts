import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAppConfig, signupOpen, type AppConfigPayload } from './useAppConfig';

const CONFIG: AppConfigPayload = {
  maintenanceMode: false,
  maintenanceMessage: null,
  allowPublicSignup: false,
  minAppVersionCode: 1,
  minAppVersionName: '1.0.0',
  appUpdateMessage: null,
  appStoreUrl: null,
  forceUpdateRequired: false,
  defaultPlan: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAppConfig', () => {
  it('calls /api/v1/auth/app-config with no query string', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: CONFIG }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAppConfig()).resolves.toEqual(CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/v1/auth/app-config');
  });
});

describe('signupOpen', () => {
  it('is false while loading or on error', () => {
    expect(signupOpen(undefined)).toBe(false);
  });

  it('follows allowPublicSignup once the config has loaded', () => {
    expect(signupOpen({ ...CONFIG, allowPublicSignup: false })).toBe(false);
    expect(signupOpen({ ...CONFIG, allowPublicSignup: true })).toBe(true);
  });
});
