import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readStored, writeStored } from '../../lib/storage';
import {
  ALL_HOMES,
  type HomeScope,
  homeOptions,
  legacyAccountScope,
  resolveScope,
  scopeStorageKey,
  serializeScope,
} from './scope';
import type { ConsolidatedOverview } from './types';

/**
 * The home switcher's choice for this person on this device (localStorage). An old
 * `?account=` link wins while it is in the address; it is saved and then dropped.
 */
export function useHomeScope(userId: string, overview: ConsolidatedOverview | undefined): [HomeScope, (s: HomeScope) => void] {
  const key = scopeStorageKey(userId);
  const [params, setParams] = useSearchParams();
  const [, rerender] = useState(0);
  const options = useMemo(() => (overview ? homeOptions(overview) : []), [overview]);

  const setScope = useCallback((s: HomeScope) => {
    writeStored(key, serializeScope(s));
    rerender((n) => n + 1);
  }, [key]);

  const legacy = params.get('account');
  const legacyScope = legacy && overview ? legacyAccountScope(legacy, overview) : null;
  useEffect(() => {
    if (!legacyScope) return;
    writeStored(key, serializeScope(legacyScope));
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('account');
      return next;
    }, { replace: true });
  }, [key, legacyScope, setParams]);

  if (!overview) return [ALL_HOMES, setScope];
  return [legacyScope ?? resolveScope(readStored(key), options), setScope];
}
