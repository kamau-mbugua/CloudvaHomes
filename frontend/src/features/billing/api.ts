import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { portfolioErrorMessage } from '../portfolio/api';
import type { ChargeKind, ChargeType, MoveInCharge } from './types';

/**
 * Query keys, shared reads and error messages for the billing screens (charges, meters
 * and readings, invoices, the invoice run).
 *
 * Keys start with the resource, so invalidating `keys.invoices` refreshes every list,
 * filter and detail. Voiding an invoice unlocks its readings and variable amounts, so a
 * void also refreshes those (`AFTER_VOID_KEYS`).
 */
export const keys = {
  chargeTypes: ['charge-types'] as const,
  moveInCharges: ['move-in-charges'] as const,
  chargeEntries: ['charge-entries'] as const,
  meters: ['meters'] as const,
  readings: ['meter-readings'] as const,
  invoices: ['invoices'] as const,
  runPreview: ['invoices-run-preview'] as const,
};

/** An invoice change can unlock billed readings and amounts, and changes what a run would do. */
export const AFTER_INVOICE_KEYS = [keys.invoices, keys.readings, keys.chargeEntries, keys.runPreview];

export function useChargeTypes(
  filter: { propertyId?: string; kind?: ChargeKind; status?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: [...keys.chargeTypes, filter],
    queryFn: () => api.get<DataEnvelope<ChargeType[]>>('/charge-types', filter).then((r) => r.data),
    enabled: enabled && Boolean(filter.propertyId),
  });
}

export function useMoveInCharges(propertyId: string, enabled = true) {
  return useQuery({
    queryKey: [...keys.moveInCharges, { propertyId }],
    queryFn: () => api.get<DataEnvelope<MoveInCharge[]>>('/move-in-charges', { propertyId }).then((r) => r.data),
    enabled: enabled && Boolean(propertyId),
  });
}

/**
 * Fetches the invoice PDF with the session's bearer token (a plain link would carry no
 * token) and saves it as `INV-2026-000123.pdf`.
 */
export async function downloadInvoicePdf(invoice: { id: string; number: string }): Promise<void> {
  const blob = await api.blob(`/invoices/${invoice.id}/pdf`);
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${invoice.number || 'invoice'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before the object URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Plain-English messages for the billing error codes. `overrides` rewords a code for one
 * screen (IN_USE means "has meters" for a charge but "has readings" for a meter). Anything
 * else falls through to the portfolio messages, then the server's own words.
 */
export function billingErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    switch (error.code) {
      case 'ALREADY_BILLED':
        return 'Some of these figures are already on an invoice, so nothing was saved. Void that invoice first to change them.';
      case 'ALREADY_INVOICED':
        return 'This tenancy already has a move-in invoice.';
      case 'NO_MOVE_IN_CHARGES':
        return 'This property has no active move-in charges. Add them under Charges → Move-in charges first.';
      case 'INVOICE_SETTLED':
        return 'Something has already been paid or credited on this invoice, so it can’t be voided. Issue a credit note instead.';
      case 'INVOICE_VOID':
        return 'This invoice has been voided, so it can’t be changed.';
      case 'SERIAL_TAKEN':
        return 'Another meter already has this serial number.';
      case 'METER_EXISTS':
        return 'This unit already has a meter for that charge. Edit that meter instead.';
      case 'TENANCY_INVOICED':
        return 'This tenancy has invoices, so it can’t be deleted. To end it, use Move out.';
      case 'IN_USE':
        return 'It is already in use (billed, or with meters or readings), so it can’t be deleted. Mark it inactive instead.';
      case 'NAME_TAKEN':
        return 'This property already has a charge with that name. Choose a different one.';
      default:
        return portfolioErrorMessage(error);
    }
  }
  return portfolioErrorMessage(error);
}
