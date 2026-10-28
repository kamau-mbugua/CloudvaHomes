import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import type { CatalogueItem, Landlord, Property } from './types';

/**
 * Query keys, shared reads and error messages for the portfolio screens (properties,
 * units, unit setup, tenants, tenancies, landlords).
 *
 * Keys start with the resource, so `invalidateQueries({ queryKey: keys.units })` refreshes
 * every list, filter and detail of it. A change that moves occupancy (a move-in, notice,
 * move-out) touches units, properties, tenants and tenancies at once — see `afterTenancyChange`.
 */
export const keys = {
  landlords: ['landlords'] as const,
  properties: ['properties'] as const,
  units: ['units'] as const,
  tenants: ['tenants'] as const,
  tenancies: ['tenancies'] as const,
  catalogue: (kind: CatalogueKind) => ['catalogue', kind] as const,
};

/** Every key a tenancy change can make stale. */
export const OCCUPANCY_KEYS = [keys.units, keys.properties, keys.tenants, keys.tenancies];

export type CatalogueKind = 'unit-categories' | 'unit-types' | 'unit-features';

/** Options lists are "the first 100" — enough for a picker; the contract's page size cap. */
export const OPTIONS_PAGE_SIZE = 100;

export function useCatalogue(kind: CatalogueKind, enabled = true) {
  return useQuery({
    queryKey: keys.catalogue(kind),
    queryFn: () => api.get<DataEnvelope<CatalogueItem[]>>(`/${kind}`).then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

/** Properties for pickers and filters (`GET /properties?pageSize=100`). */
export function usePropertyOptions(enabled = true) {
  return useQuery({
    queryKey: [...keys.properties, 'options'],
    queryFn: () => api.get<PageEnvelope<Property>>('/properties', { pageSize: OPTIONS_PAGE_SIZE }),
    enabled,
    staleTime: 30_000,
  });
}

/** Landlords for the property sheet's picker and the properties filter (agencies only). */
export function useLandlordOptions(enabled = true) {
  return useQuery({
    queryKey: [...keys.landlords, 'options'],
    queryFn: () => api.get<PageEnvelope<Landlord>>('/landlords', { pageSize: OPTIONS_PAGE_SIZE }),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * The full ID number for a tenant or landlord (`GET /tenants/:id/id-number`, audited
 * server-side). The contract shows `{ idNumber }`; accepted with or without the usual
 * `data` envelope.
 */
export async function fetchIdNumber(resource: 'tenants' | 'landlords', id: string): Promise<string> {
  const body = await api.get<{ data?: { idNumber?: string }; idNumber?: string }>(`/${resource}/${id}/id-number`);
  const value = body.data?.idNumber ?? body.idNumber;
  if (!value) throw new Error('No ID number was returned.');
  return value;
}

/** A tenant code ("T00012") or landlord code inside a server message, to name the clash. */
function codeIn(message: string): string | null {
  return /\b[TL]\d{4,}\b/.exec(message)?.[0] ?? null;
}

/**
 * Plain-English messages for the portfolio error codes. The server's own message is the
 * fallback, so a new code still reads sensibly.
 */
export function portfolioErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AGENCY_ONLY':
        return 'Landlords are only kept by agencies. This organisation is a landlord’s own.';
      case 'CODE_TAKEN':
        return 'Another property already uses this code. Choose a different one.';
      case 'NUMBER_TAKEN':
        return 'That unit number is already used in this property.';
      case 'PHONE_TAKEN': {
        const code = codeIn(error.message);
        return code ? `Another tenant (${code}) already uses this phone number.` : 'Another tenant already uses this phone number.';
      }
      case 'ID_NUMBER_TAKEN': {
        const code = codeIn(error.message);
        return code ? `This ID number is already on file for ${code}.` : 'This ID number is already on file for someone else.';
      }
      case 'NAME_TAKEN':
        return 'That name is already used. Choose a different one.';
      case 'IN_USE':
        return 'Units still use this. Change those units first, then delete it.';
      case 'LANDLORD_HAS_PROPERTIES':
        return 'This landlord still has properties. Move or delete them first, or mark the landlord inactive instead.';
      case 'PROPERTY_HAS_UNITS':
        return 'This property still has units. Delete them first, or mark the property inactive instead.';
      case 'UNIT_HAS_HISTORY':
        return 'This unit has tenancy history, so it cannot be deleted. Mark it inactive instead.';
      case 'TENANT_HAS_HISTORY':
        return 'This tenant has tenancy history, so they cannot be deleted.';
      case 'UNIT_OCCUPIED':
        return 'This unit has a current tenant. Move them out first.';
      case 'UNIT_INACTIVE':
        return 'This unit is inactive. Make it active before moving someone in.';
      case 'TENANCY_INVOICED':
        return 'This tenancy has invoices, so it can’t be deleted. To end it, use Move out.';
      case 'TENANCY_ENDED':
        return 'This tenancy has already ended and cannot be changed.';
      case 'PERMISSION_DENIED':
        return 'Your role does not allow this change.';
      case 'NOT_FOUND':
        return 'It no longer exists, or you do not have access to it.';
      default:
        return error.requestId && error.status >= 500 ? `${error.message} (ref ${error.requestId})` : error.message;
    }
  }
  return 'Something went wrong. Try again.';
}
