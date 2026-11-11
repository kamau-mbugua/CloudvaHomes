import { isPlatformOperator, landingFor, type MenuHere } from './portals';
import { switchContext } from './session';
import type { Place, Session } from './types';

export type { Place };

type NonAdminPlace = Exclude< Place, 'PLATFORM' >;
let priorPlaceInTab: NonAdminPlace | null = null;

/** Record which non-admin place an operator left when opening `/admin` in this tab. */
export function notePriorPlace(here: MenuHere): void {
  if (here === 'staff') priorPlaceInTab = 'STAFF';
  else if (here === 'tenant') priorPlaceInTab = 'TENANT';
  else if (here === 'owner') priorPlaceInTab = 'OWNER';
}

export function clearPriorPlace(): void {
  priorPlaceInTab = null;
}

export function getPriorPlace(): NonAdminPlace | null {
  return priorPlaceInTab;
}

/** Save which kind of place the person chose on the server (e.g. opening the sales console). */
export function setPlace(place: Place): Promise<Session> {
  return switchContext({ place });
}

/**
 * Where to land after signing in or at `/`: the server-remembered place if the person still
 * has it, otherwise the existing fallback (`landingFor` when they have no organisation,
 * `/app` when they do).
 */
export function homeFor(session: Session): '/app' | '/admin' | '/tenant' | '/owner' {
  const place = session.user.defaultPlace;
  if (place === 'PLATFORM' && isPlatformOperator(session.user)) return '/admin';
  if (place === 'TENANT' && session.tenantOf.length > 0) return '/tenant';
  if (place === 'OWNER' && session.ownerOf.length > 0) return '/owner';
  if (place === 'STAFF' && (session.activeOrganization || session.organizations.length > 0)) {
    return '/app';
  }
  const fallback = landingFor(session);
  return fallback && fallback !== 'choose' ? fallback : '/app';
}
