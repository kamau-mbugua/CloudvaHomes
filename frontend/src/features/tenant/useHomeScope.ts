import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../lib/api/client';
import { switchContext } from '../../lib/auth/session';
import { useSession } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import {
  ALL_HOMES,
  type HomeScope,
  homeOptions,
  legacyAccountScope,
  resolveScope,
} from './scope';
import type { ConsolidatedOverview } from './types';

/**
 * The home switcher's choice for this person, read from `session.user.defaultHomeId` and
 * saved on the server via `POST /auth/switch-context`. An old `?account=` link is converted
 * into that server call once and then dropped from the address.
 */
export function useHomeScope(
  overview: ConsolidatedOverview | undefined,
): [HomeScope, (s: HomeScope) => void] {
  const session = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const options = useMemo(() => (overview ? homeOptions(overview) : []), [overview]);

  const setScope = useCallback(
    (s: HomeScope) => {
      const payload =
        s.kind === 'home'
          ? { tenantId: s.tenantId, homeId: s.tenancyId, place: 'TENANT' as const }
          : { tenantId: null, homeId: null, place: 'TENANT' as const };
      void switchContext(payload).catch((caught) => {
        toast.failed(errorMessage(caught));
      });
    },
    [toast],
  );

  const legacy = params.get('account');
  const legacyScope = useMemo(
    () => (legacy && overview ? legacyAccountScope(legacy, overview) : null),
    [legacy, overview],
  );
  const convertedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!legacy || !legacyScope) return;
    if (convertedRef.current === legacy) return;
    convertedRef.current = legacy;
    setScope(legacyScope);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('account');
        return next;
      },
      { replace: true },
    );
  }, [legacy, legacyScope, setParams, setScope]);

  if (!overview) return [ALL_HOMES, setScope];
  return [legacyScope ?? resolveScope(session.user.defaultHomeId, options), setScope];
}
