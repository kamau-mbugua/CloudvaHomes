import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageMeta } from '../../lib/api/types';
import { saveBlob } from '../../lib/files';
import type { InvoiceDetail, Invoice } from '../billing/types';
import { mpesaErrorMessage } from '../mpesa/api';
import { unwrap, unwrapList } from '../payments/rules';
import type { Payment, Statement } from '../payments/types';
import type { TenantOverview } from './types';

/**
 * Reads, PDF downloads and error messages for the tenant portal. Only
 * `/api/v1/tenant/accounts/:id/*` is called; every key starts with `tenant-portal` and the
 * account, so a payment refreshes everything of that account at once.
 */

export const keys = {
  all: ['tenant-portal'] as const,
  account: (tenantId: string) => ['tenant-portal', tenantId] as const,
};

const base = (tenantId: string) => `/tenant/accounts/${encodeURIComponent(tenantId)}`;

export function useTenantOverview(tenantId: string) {
  return useQuery({
    queryKey: [...keys.account(tenantId), 'overview'],
    queryFn: () => api.get<unknown>(base(tenantId)).then((body) => unwrap<TenantOverview>(body)),
  });
}

/** `{ data, meta }` from a paged list; a bare array reads as one page. */
function readPage<T>(body: unknown): { rows: T[]; meta: PageMeta | undefined } {
  const meta = body && typeof body === 'object' && 'meta' in body ? (body as { meta?: PageMeta }).meta : undefined;
  return { rows: unwrapList<T>(body), meta };
}

/** Paged (the contract gives `?status&page`). */
export function useTenantInvoices(tenantId: string, filter: { status?: string; page?: number }) {
  return useQuery({
    queryKey: [...keys.account(tenantId), 'invoices', filter],
    queryFn: () => api.get<unknown>(`${base(tenantId)}/invoices`, { status: filter.status, page: filter.page && filter.page > 1 ? filter.page : undefined })
      .then((body) => readPage<Invoice>(body)),
    placeholderData: keepPreviousData,
  });
}

export function useTenantInvoice(tenantId: string, invoiceId: string) {
  return useQuery({
    queryKey: [...keys.account(tenantId), 'invoices', 'detail', invoiceId],
    queryFn: () => api.get<unknown>(`${base(tenantId)}/invoices/${encodeURIComponent(invoiceId)}`).then((body) => unwrap<InvoiceDetail>(body)),
  });
}

export function useTenantStatement(tenantId: string, range: { from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: [...keys.account(tenantId), 'statement', range],
    queryFn: () => api.get<unknown>(`${base(tenantId)}/statement`, range).then((body) => unwrap<Statement>(body)),
    enabled,
  });
}

/** Paged; only `page` is sent (the server's default page size). */
export function useTenantPayments(tenantId: string, page = 1) {
  return useQuery({
    queryKey: [...keys.account(tenantId), 'payments', { page }],
    queryFn: () => api.get<unknown>(`${base(tenantId)}/payments`, { page: page > 1 ? page : undefined }).then((body) => readPage<Payment>(body)),
    placeholderData: keepPreviousData,
  });
}

export async function downloadTenantInvoice(tenantId: string, invoice: { id: string; number: string }): Promise<void> {
  saveBlob(await api.blob(`${base(tenantId)}/invoices/${encodeURIComponent(invoice.id)}/pdf`), `${invoice.number || 'invoice'}.pdf`, 'application/pdf');
}

export async function downloadTenantReceipt(tenantId: string, payment: { id: string; number: string }): Promise<void> {
  saveBlob(await api.blob(`${base(tenantId)}/payments/${encodeURIComponent(payment.id)}/receipt`), `${payment.number || 'receipt'}.pdf`, 'application/pdf');
}

export async function downloadTenantStatement(tenantId: string, code: string | undefined, range: { from?: string; to?: string }): Promise<void> {
  const blob = await api.blob(`${base(tenantId)}/statement/pdf`, range);
  const span = range.from || range.to ? `-${range.from ?? 'start'}-to-${range.to ?? 'today'}` : '';
  saveBlob(blob, `Statement-${code || 'tenant'}${span}.pdf`, 'application/pdf');
}

export const payPath = (tenantId: string) => `${base(tenantId)}/pay`;
export const payStatusPath = (tenantId: string, stkId: string) => `${base(tenantId)}/pay/${encodeURIComponent(stkId)}`;

/**
 * The tenant portal's wording. Written for a tenant, not for staff: no "check the Daraja
 * keys", and a 404 means "not yours" rather than "deleted".
 */
export function tenantErrorMessage(error: unknown, orgName = 'your landlord'): string {
  if (error instanceof ApiError) {
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return `We couldn’t find this for your account. If you think it should be here, contact ${orgName}.`;
    }
    switch (error.code) {
      case 'NO_MPESA':
        return `${orgName} hasn’t set up paying in the app for your home yet. Pay with M-Pesa using the paybill details under “How to pay”.`;
      case 'NOTHING_DUE':
        return 'You don’t owe anything right now.';
      case 'DARAJA_NOT_CONFIGURED':
      case 'DARAJA_ERROR':
        return 'M-Pesa couldn’t send the prompt just now. Try again in a minute, or pay with the paybill details under “How to pay”.';
      case 'IDEMPOTENCY_MISMATCH':
        return 'This payment was already started with different details. Close this and start again.';
      case 'PERMISSION_DENIED':
      case 'FORBIDDEN':
        return `Your account can’t open this. If you think it should, contact ${orgName}.`;
      default:
        return mpesaErrorMessage(error);
    }
  }
  return mpesaErrorMessage(error);
}
