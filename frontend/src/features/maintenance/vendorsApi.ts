import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import type { Vendor } from './types';

export const VENDORS_KEY = ['vendors'] as const;

/** Active vendors (a small list, one page), for the "Assign to vendor" picker. */
export function useActiveVendors(enabled = true) {
  return useQuery({
    queryKey: [...VENDORS_KEY, 'active'],
    queryFn: () => api.get<PageEnvelope<Vendor>>('/vendors', { pageSize: 100 }).then((r) => r.data),
    enabled,
  });
}
