import { useQuery } from '@tanstack/react-query';
import { ApiError, STEP_UP_REQUIRED, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { paymentsErrorMessage } from '../payments/api';
import { unwrap } from '../payments/rules';
import type { InboundDetail } from './types';

/**
 * Query keys, shared reads and error messages for the M-Pesa screens. Assigning an
 * inbound transaction records a payment, so it also refreshes the payment keys
 * (`AFTER_PAYMENT_KEYS`).
 */
export const keys = {
  inbound: ['inbound-transactions'] as const,
  stk: ['stk-requests'] as const,
};

/** How many M-Pesa transactions wait to be matched — the sidebar count. */
export function useUnmatchedCount(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.inbound, 'unmatched-count'],
    queryFn: () => api.get<PageEnvelope<unknown>>('/inbound-transactions', { status: 'UNMATCHED', pageSize: 1 })
      .then((body) => body?.meta?.total ?? 0),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    // A count in the menu is a courtesy: never retry noisily, never surface its errors.
    retry: false,
  });
}

export function useInboundDetail(id: string) {
  return useQuery({
    queryKey: [...keys.inbound, 'detail', id],
    queryFn: () => api.get<unknown>(`/inbound-transactions/${id}`).then((body) => unwrap<InboundDetail>(body)),
  });
}

/**
 * Plain-English messages for the M-Pesa error codes. `overrides` rewords a code for one
 * screen. Anything else falls through to the payment (then billing, portfolio) messages.
 */
export function mpesaErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    switch (error.code) {
      case 'DARAJA_NOT_CONFIGURED':
        return 'This channel isn’t connected to M-Pesa yet. Save its Daraja keys (and the passkey, for payment prompts) under Money → Payment channels first.';
      case 'DARAJA_ERROR': {
        const said = error.message.trim();
        return said
          ? `M-Pesa (Safaricom) refused the request: “${said}”. Check the channel’s Daraja keys and try again.`
          : 'M-Pesa (Safaricom) refused the request. Check the channel’s Daraja keys and try again.';
      }
      case 'NOT_MPESA_CHANNEL':
        return 'Only M-Pesa paybill and till channels can be connected to M-Pesa.';
      case 'ALREADY_RESOLVED':
        return 'Someone has already dealt with this transaction, so nothing was changed. The page now shows where it went.';
      case 'IDEMPOTENCY_MISMATCH':
        return 'This request was already sent with different details. Close the dialog and start again.';
      case STEP_UP_REQUIRED:
        return 'This change needs the verification code we send you. Nothing was changed.';
      default:
        return paymentsErrorMessage(error);
    }
  }
  return paymentsErrorMessage(error);
}
