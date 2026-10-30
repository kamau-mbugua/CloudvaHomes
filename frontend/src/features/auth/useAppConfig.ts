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

export function useAppConfig() {
  return useQuery({
    queryKey: ['auth', 'app-config'],
    queryFn: async () => {
      const res = await api.get<DataEnvelope<AppConfigPayload>>('/auth/app-config', {
        skipAuthRetry: true,
      });
      return res.data;
    },
    staleTime: 60_000,
  });
}
