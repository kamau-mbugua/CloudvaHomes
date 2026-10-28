import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { STK_POLL_MS, STK_WAIT_MS, isFinalStk, stkPollDelay } from './rules';
import type { StkState } from './types';

/**
 * Follows a payment request (STK push) after it went out: asks for its state every 3 s
 * while pending, for about three minutes, then stops and says so (`gaveUp`); the server's
 * sweep job finishes it either way. "Check again" starts another three minutes.
 *
 * Shared by the staff "Request M-Pesa payment" dialog, the tenant portal's "Pay now" and
 * an organisation paying its Hodi bill (phase 8); only the URL and the shape differ.
 */
export function useStkFollow<T extends { state: StkState }>({ queryKey, fetchStk, first, startedAt: initialStart }: {
  queryKey: QueryKey;
  fetchStk: () => Promise<T>;
  first: T;
  startedAt: number;
}) {
  const [startedAt, setStartedAt] = useState(initialStart);
  const [gaveUp, setGaveUp] = useState(false);

  const status = useQuery({
    queryKey,
    queryFn: fetchStk,
    initialData: first,
    initialDataUpdatedAt: initialStart,
    refetchInterval: (query) => stkPollDelay(query.state.data?.state, startedAt, Date.now()),
    // The tenant pays on their phone, which may mean leaving this tab; keep following.
    refetchIntervalInBackground: true,
    staleTime: STK_POLL_MS,
  });
  // `initialData` means there is always one; generic T hides that from the overloads.
  const stk: T = status.data ?? first;
  const final = isFinalStk(stk.state);

  useEffect(() => {
    if (final) return undefined;
    const timer = setTimeout(() => setGaveUp(true), Math.max(0, startedAt + STK_WAIT_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [final, startedAt]);

  const checkAgain = () => {
    setGaveUp(false);
    setStartedAt(Date.now());
    void status.refetch();
  };

  return { stk, status, waiting: stk.state === 'PENDING', gaveUp, checkAgain };
}
