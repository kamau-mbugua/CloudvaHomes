import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';

export interface AppConfigPayload {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  allowPublicSignup: boolean;
  minAppVersionCode: number;
  minAppVersionName: string;
  appUpdateMessage: string | null;
  appStoreUrl: string | null;
  forceUpdateRequired: boolean;
  defaultPlan: {
    name: string;
    trialDays: number;
    pricePerUnit: number;
    minimumMonthly: number;
  } | null;
}

/**
 * Public settings shown before sign-in. `api.get`'s second argument is the query string, so
 * nothing is passed: the API rejects unknown query fields (a stray `?skipAuthRetry=true`
 * made every call fail with 422).
 */
export async function fetchAppConfig(): Promise<AppConfigPayload> {
  const res = await api.get<DataEnvelope<AppConfigPayload>>('/auth/app-config');
  return res.data;
}

/** Sign-up stays closed until the config has loaded and says it is open. */
export function signupOpen(cfg: AppConfigPayload | undefined): boolean {
  return cfg?.allowPublicSignup === true;
}

export function useAppConfig() {
  return useQuery({
    queryKey: ['auth', 'app-config'],
    queryFn: fetchAppConfig,
    staleTime: 60_000,
  });
}
