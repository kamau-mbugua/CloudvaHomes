import { useQuery } from '@tanstack/react-query';
import { ApiError, STEP_UP_REQUIRED, api } from '../../lib/api/client';
import { mpesaErrorMessage } from '../mpesa/api';
import { unwrapList } from '../payments/rules';
import type { PayoutAccount, StatementImport } from './types';

/**
 * Query keys, reads and error messages for the bank screens (phase 10): statement
 * imports, bank notifications and the M-Pesa B2C payout account. An import records
 * payments, so it also refreshes the payment and reconciliation keys (see the import
 * sheet).
 */
export const bankKeys = {
  imports: ['statement-imports'] as const,
  preview: ['statement-imports', 'preview'] as const,
  payoutAccounts: ['payout-accounts'] as const,
};

export function useStatementImports(channelId: string, enabled = true) {
  return useQuery({
    queryKey: [...bankKeys.imports, 'history', channelId],
    queryFn: () => api.get<unknown>(`/payment-channels/${channelId}/statement-imports`).then((body) => unwrapList<StatementImport>(body)),
    enabled,
  });
}

export function usePayoutAccounts(enabled = true) {
  return useQuery({
    queryKey: bankKeys.payoutAccounts,
    queryFn: () => api.get<unknown>('/payout-accounts').then((body) => unwrapList<PayoutAccount>(body)),
    enabled,
  });
}

/**
 * Plain-English messages for the phase 10 bank codes. `overrides` rewords a code for one
 * screen. Anything else falls through to the M-Pesa (then payment, billing, portfolio)
 * messages.
 */
export function banksErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    switch (error.code) {
      case 'CSV_INVALID': {
        const said = error.message.trim();
        return said
          ? `Hodi couldn’t read this file: ${said}`
          : 'Hodi couldn’t read this file. Export the statement from your bank again as CSV and try once more.';
      }
      case 'NOT_BANK_CHANNEL':
        return 'Only bank account channels take bank statements and bank notifications.';
      case 'NO_PAYOUT_ACCOUNT':
        return 'There’s no M-Pesa payout account yet. Set one up under Settings → Payouts first.';
      case STEP_UP_REQUIRED:
        return 'This change needs the verification code we send you. Nothing was changed.';
      default:
        return mpesaErrorMessage(error);
    }
  }
  return mpesaErrorMessage(error);
}
