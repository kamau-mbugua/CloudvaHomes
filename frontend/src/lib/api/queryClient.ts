import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // One retry for reads, and only when retrying could help: a 4xx will answer the
      // same way the second time.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      refetchOnWindowFocus: false,
    },
    mutations: {
      // NEVER auto-retry a write. A mutation that timed out may still have succeeded on
      // the server; retrying a payment, an allocation or a remittance would move money
      // twice. Retrying a write is a deliberate, idempotency-keyed user action.
      retry: 0,
    },
  },
});
