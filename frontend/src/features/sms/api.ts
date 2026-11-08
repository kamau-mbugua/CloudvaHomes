import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { unwrap } from '../payments/rules';
import type { SmsAccountView, SmsQuote } from './types';

export { platformErrorMessage as smsErrorMessage } from '../platform/api';

export const smsKeys = {
  all: ['sms'] as const,
  account: ['sms', 'account'] as const,
  quote: ['sms', 'quote'] as const,
  usage: ['sms', 'usage'] as const,
  topUps: ['sms', 'top-ups'] as const,
};

export const SMS_PAGE_SIZE = 25;

/** `GET /sms` — balance, mode and warnings (page, banner, bulk-send hints). */
export function useSmsAccount(enabled = true) {
  return useQuery({
    queryKey: smsKeys.account,
    queryFn: () => api.get<unknown>('/sms').then((b) => unwrap<SmsAccountView>(b)),
    enabled,
    staleTime: 60_000,
  });
}

export function useSmsQuote(enabled = true) {
  return useQuery({
    queryKey: smsKeys.quote,
    queryFn: () => api.get<unknown>('/sms/quote').then((b) => unwrap<SmsQuote>(b)),
    enabled,
  });
}
