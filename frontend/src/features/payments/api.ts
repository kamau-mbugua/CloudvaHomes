import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { keys as billingKeys, billingErrorMessage } from '../billing/api';
import { keys as portfolioKeys } from '../portfolio/api';
import { unwrap, unwrapList } from './rules';
import type { Deposit, OpenInvoice, PaymentChannel, Statement } from './types';

/**
 * Query keys, shared reads, PDF downloads and error messages for the payment screens.
 *
 * Money moving touches a lot: invoice balances and statuses, the tenant's balance and
 * credit, deposits held, statements. Every payment change refreshes `AFTER_PAYMENT_KEYS`.
 */
export const keys = {
  channels: ['payment-channels'] as const,
  payments: ['payments'] as const,
  openInvoices: ['open-invoices'] as const,
  statements: ['statements'] as const,
  deposits: ['deposits'] as const,
};

export const AFTER_PAYMENT_KEYS = [
  keys.payments, keys.openInvoices, keys.statements, keys.deposits,
  billingKeys.invoices, portfolioKeys.tenants, portfolioKeys.tenancies,
];

export function useChannels(filter: { status?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: [...keys.channels, filter],
    queryFn: () => api.get<unknown>('/payment-channels', filter).then((body) => unwrapList<PaymentChannel>(body)),
    enabled,
    staleTime: 30_000,
  });
}

export function useOpenInvoices(tenantId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...keys.openInvoices, tenantId],
    queryFn: () => api.get<unknown>(`/tenants/${tenantId}/open-invoices`).then((body) => unwrapList<OpenInvoice>(body)),
    enabled: enabled && Boolean(tenantId),
  });
}

export function useStatement(tenantId: string, range: { from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: [...keys.statements, tenantId, range],
    queryFn: () => api.get<unknown>(`/tenants/${tenantId}/statement`, range).then((body) => unwrap<Statement>(body)),
    enabled,
  });
}

export function useDeposit(tenancyId: string, enabled = true) {
  return useQuery({
    queryKey: [...keys.deposits, tenancyId],
    queryFn: () => api.get<unknown>(`/tenancies/${tenancyId}/deposit`).then((body) => unwrap<Deposit>(body)),
    enabled,
  });
}

/** Saves a blob as a file — the PDFs are fetched with the session token, so not a plain link. */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The receipt PDF, saved as `RCT-2026-000012.pdf`. */
export async function downloadReceiptPdf(payment: { id: string; number: string }): Promise<void> {
  save(await api.blob(`/payments/${payment.id}/receipt`), `${payment.number || 'receipt'}.pdf`);
}

/** The statement PDF for the same range as the screen, saved as `Statement-T00012.pdf`. */
export async function downloadStatementPdf(tenant: { id: string; code: string }, range: { from?: string; to?: string }): Promise<void> {
  const blob = await api.blob(`/tenants/${tenant.id}/statement/pdf`, range);
  const span = range.from || range.to ? `-${range.from ?? 'start'}-to-${range.to ?? 'today'}` : '';
  save(blob, `Statement-${tenant.code || 'tenant'}${span}.pdf`);
}

/**
 * Plain-English messages for the payment error codes. `overrides` rewords a code for one
 * screen. Anything else falls through to the billing (then portfolio) messages.
 */
export function paymentsErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    switch (error.code) {
      case 'DUPLICATE_REFERENCE': {
        const earlier = /\bRCT-\d{4}-\d+\b/.exec(error.message)?.[0];
        return earlier
          ? `This reference is already recorded on this channel, as ${earlier}. The payment is probably already in.`
          : 'A payment with this reference is already recorded on this channel, so it may already be in. Check the payments list before entering it again.';
      }
      case 'CHANNEL_INACTIVE':
        return 'This payment channel is inactive. Choose another, or make it active again under Payment channels.';
      case 'ALREADY_REVERSED':
        return 'This payment has already been reversed.';
      case 'IS_REVERSAL':
        return 'This is a reversal, and a reversal can’t itself be reversed.';
      case 'TENANCY_ACTIVE':
        return 'A deposit can only be settled once the tenant is on notice or has moved out.';
      case 'NAME_TAKEN':
        return 'Another payment channel already has this name. Choose a different one.';
      case 'IN_USE':
        return 'Payments have been recorded on this channel, so it can’t be deleted. Mark it inactive instead.';
      default:
        return billingErrorMessage(error);
    }
  }
  return billingErrorMessage(error);
}
