import { useQuery } from '@tanstack/react-query';
import { ApiError, STEP_UP_REQUIRED, api } from '../../lib/api/client';
import { mpesaErrorMessage } from '../mpesa/api';
import { unwrap, unwrapList } from '../payments/rules';
import type {
  BillingSummary, Plan, PlatformEmailSettings, PlatformEmailTemplate, PlatformOperator, PlatformSettings, PlatformStats, RateLimitLock, UnassignedOrganization,
} from './types';

/**
 * Query keys, shared reads, the invoice PDF and error messages for platform billing: the
 * organisation's own "Plan & billing" (`/billing/*`) and the platform admin area
 * (`/platform/*`).
 *
 * Only endpoints the contract marks as paged get `page` / `pageSize`; the others reject
 * unknown query parameters (422), so they are called bare.
 */
export const keys = {
  /** The organisation's own Hodi billing — summary, invoices, payments, pay requests. */
  billing: ['hodi-billing'] as const,
  /** Everything under /platform. */
  platform: ['platform'] as const,
  stats: ['platform', 'stats'] as const,
  plans: ['platform', 'plans'] as const,
  organizations: ['platform', 'organizations'] as const,
  invoices: ['platform', 'invoices'] as const,
  payments: ['platform', 'payments'] as const,
  settings: ['platform', 'settings'] as const,
  operators: ['platform', 'operators'] as const,
  emailSettings: ['platform', 'email-settings'] as const,
  emailTemplates: ['platform', 'email-templates'] as const,
  emailLogs: ['platform', 'email-logs'] as const,
  locks: ['platform', 'locks'] as const,
  reports: ['platform', 'reports'] as const,
};

export const PAGE_SIZE = 25;

/** `GET /billing` — the banner and the billing page. Unpaged. */
export function useBillingSummary(enabled = true) {
  return useQuery({
    queryKey: [...keys.billing, 'summary'],
    queryFn: () => api.get<unknown>('/billing').then((body) => unwrap<BillingSummary>(body)),
    enabled,
    staleTime: 60_000,
  });
}

/** `GET /platform/plans`. Unpaged. */
export function usePlans(enabled = true) {
  return useQuery({
    queryKey: keys.plans,
    queryFn: () => api.get<unknown>('/platform/plans').then((body) => unwrapList<Plan>(body)),
    enabled,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: () => api.get<unknown>('/platform/stats').then((body) => unwrap<PlatformStats>(body)),
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => api.get<unknown>('/platform/settings').then((body) => unwrap<PlatformSettings>(body)),
  });
}

export function usePlatformOperators(enabled = true) {
  return useQuery({
    queryKey: keys.operators,
    queryFn: () =>
      api.get<unknown>('/platform/operators').then((body) => {
        const res = unwrap<{ operators?: PlatformOperator[] } | PlatformOperator[]>(body);
        return Array.isArray(res) ? res : (res.operators ?? []);
      }),
    enabled,
  });
}

export function useUnassignedOrganizations(enabled = true) {
  return useQuery({
    queryKey: [...keys.organizations, 'unassigned'],
    queryFn: () => api.get<unknown>('/platform/organizations/unassigned').then((body) => unwrapList<UnassignedOrganization>(body)),
    enabled,
  });
}

export function usePlatformEmailSettings(enabled = true) {
  return useQuery({
    queryKey: keys.emailSettings,
    queryFn: () => api.get<unknown>('/platform/email/settings').then((body) => unwrap<PlatformEmailSettings>(body)),
    enabled,
  });
}

export function usePlatformEmailTemplates(enabled = true) {
  return useQuery({
    queryKey: keys.emailTemplates,
    queryFn: () =>
      api.get<unknown>('/platform/email/templates').then((body) => unwrapList<PlatformEmailTemplate>(body)),
    enabled,
  });
}

export function usePlatformLocks(enabled = true) {
  return useQuery({
    queryKey: keys.locks,
    queryFn: () => api.get<unknown>('/platform/security/locks').then((body) => unwrapList<RateLimitLock>(body)),
    enabled,
  });
}

/**
 * A Hodi invoice as a PDF, saved as `HODI-2026-000001.pdf` — the organisation's own
 * (`/billing/…`) or, for a platform admin, any (`/platform/…`).
 */
export async function downloadHodiInvoicePdf(invoice: { id: string; number: string }, from: 'billing' | 'platform' = 'billing'): Promise<void> {
  const blob = await api.blob(`/${from === 'platform' ? 'platform' : 'billing'}/invoices/${encodeURIComponent(invoice.id)}/pdf`);
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${invoice.number || 'hodi-invoice'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Plain-English messages for the platform billing codes. `overrides` rewords a code for
 * one screen. Anything else falls through to the M-Pesa (payment, billing, portfolio)
 * messages. `ORG_SUSPENDED` already carries its own wording (set in the API client).
 */
export function platformErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    switch (error.code) {
      case 'PLAN_IN_USE':
        return 'Organisations are on this plan, so it can’t be deleted. Move them to another plan first, or mark it inactive so no new organisation gets it.';
      case 'NO_MPESA':
        return 'Paying in the app isn’t available right now. Pay with M-Pesa to KodiHub’s paybill using the account number shown under “How to pay”.';
      case 'DUPLICATE_REFERENCE':
        return 'A payment with this reference is already recorded, so it may already be in. Check the payments list before entering it again.';
      case 'NOTHING_DUE':
        return 'Nothing is owed to KodiHub right now.';
      case 'INVOICE_SETTLED':
        return 'Something has already been paid on this invoice, so it can’t be voided.';
      case 'INVOICE_VOID':
        return 'This invoice has already been voided.';
      case 'NAME_TAKEN':
        return 'Another plan already has this name. Choose a different one.';
      case 'PERMISSION_DENIED':
      case 'FORBIDDEN':
        return 'Only KodiHub’s platform admins can do this.';
      case STEP_UP_REQUIRED:
        return 'This change needs the verification code we send you. Nothing was changed.';
      default:
        return mpesaErrorMessage(error);
    }
  }
  return mpesaErrorMessage(error);
}
