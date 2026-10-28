import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageMeta } from '../../lib/api/types';
import { saveBlob } from '../../lib/files';
import { keys as portfolioKeys } from '../portfolio/api';
import { paymentsErrorMessage } from '../payments/api';
import { unwrap, unwrapList } from '../payments/rules';
import { statementFilename } from './rules';
import type { Agreement, LandlordAccount, LedgerBucket, LedgerEntry, OwnerLandlord, OwnerStatement, Remittance } from './types';

/**
 * Query keys, reads, PDF downloads and error messages for agency accounting.
 *
 * Every key starts with `agencyKeys.root`, and a ledger-moving change (adjustment,
 * remittance paid) also refreshes the landlords (their balances ride on `GET
 * /landlords/:id`).
 */
export const agencyKeys = {
  root: ['agency'] as const,
  agreements: ['agency', 'agreements'] as const,
  ledger: ['agency', 'ledger'] as const,
  statements: ['agency', 'statements'] as const,
  remittances: ['agency', 'remittances'] as const,
  accounts: ['agency', 'accounts'] as const,
  owner: ['owner'] as const,
};

/** Everything an adjustment, a paid remittance or an agreement change can move. */
export const AFTER_LEDGER_KEYS = [agencyKeys.ledger, agencyKeys.statements, agencyKeys.remittances, agencyKeys.accounts, portfolioKeys.landlords];

type Params = Record<string, string | number | boolean | undefined>;

/** A paged list, whatever the wrapper: rows plus meta when there is one. */
function readPage<T>(body: unknown): { data: T[]; meta?: PageMeta } {
  const meta = body && typeof body === 'object' && 'meta' in body ? (body as { meta?: PageMeta }).meta : undefined;
  return { data: unwrapList<T>(body), meta };
}

export function useAgreements(filter: { landlordId?: string; active?: boolean }, enabled = true) {
  return useQuery({
    queryKey: [...agencyKeys.agreements, filter],
    queryFn: () => api.get<unknown>('/agreements', { landlordId: filter.landlordId, active: filter.active })
      .then((body) => unwrapList<Agreement>(body)),
    enabled,
  });
}

/** `GET /landlords/:id/account`: balances, active-agreement flag, masked payout, portal access. */
export function useLandlordAccount(landlordId: string, enabled = true) {
  return useQuery({
    queryKey: [...agencyKeys.accounts, landlordId],
    queryFn: () => api.get<unknown>(`/landlords/${landlordId}/account`).then((body) => unwrap<LandlordAccount>(body)),
    enabled: enabled && Boolean(landlordId),
  });
}

export function useLedger(landlordId: string, params: { bucket: LedgerBucket; from?: string; to?: string; page: number }, enabled = true) {
  return useQuery({
    queryKey: [...agencyKeys.ledger, landlordId, params],
    queryFn: () => api.get<unknown>(`/landlords/${landlordId}/ledger`, { ...params, pageSize: 50 }).then((body) => readPage<LedgerEntry>(body)),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useLandlordStatement(landlordId: string, range: { from: string; to: string }, enabled = true) {
  return useQuery({
    queryKey: [...agencyKeys.statements, landlordId, range],
    queryFn: () => api.get<unknown>(`/landlords/${landlordId}/statement`, range).then((body) => unwrap<OwnerStatement>(body)),
    enabled: enabled && Boolean(landlordId),
    placeholderData: keepPreviousData,
  });
}

export function useRemittances(filter: Params, enabled = true) {
  return useQuery({
    queryKey: [...agencyKeys.remittances, 'list', filter],
    queryFn: () => api.get<unknown>('/remittances', { ...filter, pageSize: 25 }).then((body) => readPage<Remittance>(body)),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useRemittance(id: string) {
  return useQuery({
    queryKey: [...agencyKeys.remittances, id],
    queryFn: () => api.get<unknown>(`/remittances/${id}`).then((body) => unwrap<Remittance>(body)),
  });
}

/** The statement PDF for the same range as the screen. */
export async function downloadLandlordStatement(landlord: { id: string; code?: string }, range: { from: string; to: string }): Promise<void> {
  const blob = await api.blob(`/landlords/${landlord.id}/statement/pdf`, range);
  saveBlob(blob, statementFilename(landlord.code, range.from, range.to), 'application/pdf');
}

// ---------------------------------------------------------------- owner portal

export function useOwnerLandlord(landlordId: string) {
  return useQuery({
    queryKey: [...agencyKeys.owner, landlordId],
    queryFn: () => api.get<unknown>(`/owner/landlords/${landlordId}`).then((body) => unwrap<OwnerLandlord>(body)),
    enabled: Boolean(landlordId),
  });
}

export function useOwnerStatement(landlordId: string, range: { from: string; to: string }, enabled = true) {
  return useQuery({
    queryKey: [...agencyKeys.owner, landlordId, 'statement', range],
    queryFn: () => api.get<unknown>(`/owner/landlords/${landlordId}/statement`, range).then((body) => unwrap<OwnerStatement>(body)),
    enabled: enabled && Boolean(landlordId),
    placeholderData: keepPreviousData,
  });
}

export function useOwnerRemittances(landlordId: string) {
  return useQuery({
    queryKey: [...agencyKeys.owner, landlordId, 'remittances'],
    queryFn: () => api.get<unknown>(`/owner/landlords/${landlordId}/remittances`).then((body) => readPage<Remittance>(body)),
    enabled: Boolean(landlordId),
  });
}

export async function downloadOwnerStatement(landlord: { id: string; code?: string }, range: { from: string; to: string }): Promise<void> {
  const blob = await api.blob(`/owner/landlords/${landlord.id}/statement/pdf`, range);
  saveBlob(blob, statementFilename(landlord.code, range.from, range.to), 'application/pdf');
}

// ---------------------------------------------------------------- errors

/**
 * Plain-English messages for the agency error codes. `overrides` rewords a code for one
 * screen. Anything else falls through to the payment (billing, portfolio) messages.
 */
export function agencyErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    switch (error.code) {
      case 'AGREEMENT_OVERLAP':
        return 'This landlord already has an agreement covering some of these properties for those dates. End that one first (the day before this one starts), or change the dates.';
      case 'AGREEMENT_IN_USE':
        return 'Money has already been booked under this agreement, so its terms can’t change and it can’t be deleted. To change the terms, end it and add a new agreement from the next day.';
      case 'REMITTANCE_EXISTS':
        return 'This landlord already has a remittance for that month. Open it from the list, or cancel it first to draft it again.';
      case 'REMITTANCE_STATE':
        return 'This remittance has moved on since you opened it (someone may have approved, paid or cancelled it). Reload to see where it stands.';
      case 'SAME_PERSON':
        return 'You drafted this remittance, so someone else has to approve it. Two people check every payout.';
      case 'NO_CONTACT':
        return 'This landlord has no phone number or e-mail on file, so there’s nowhere to send the sign-in. Add one with Edit, then try again.';
      case 'AGENCY_ONLY':
        return 'Agreements, owner statements and remittances are only used by agencies. This organisation is a landlord’s own.';
      case 'STEP_UP_REQUIRED':
        return 'This change needs a verification code. Try again and enter the code when asked.';
      default:
        return paymentsErrorMessage(error);
    }
  }
  return paymentsErrorMessage(error);
}

/** The owner portal's wording: a 404 means "not yours", not "deleted". */
export function ownerErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')) {
    return 'We couldn’t find this landlord account for you. If you were sent a link, ask the agency to check your portal access.';
  }
  return agencyErrorMessage(error);
}
