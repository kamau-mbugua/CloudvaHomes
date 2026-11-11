import { useEffect } from 'react';
import { readStored, writeStored } from '../storage';
import { isPlatformOperator, type MenuHere } from './portals';
import type { Session } from './types';

/**
 * The place a person was last in — staff app, admin area (sales console), tenant or owner
 * portal — remembered per user on this device, so signing in again lands them back there
 * instead of always in their organisation.
 */
export type Place = MenuHere;

const PLACES: readonly Place[] = ['staff', 'admin', 'tenant', 'owner'];
const key = (userId: string) => `kodihub:last-place:${userId}`;

export function parsePlace(value: string | null | undefined): Place | null {
  return PLACES.includes(value as Place) ? (value as Place) : null;
}

export function rememberedPlace(userId: string): Place | null {
  return parsePlace(readStored(key(userId)));
}

/** Records the place the person is in while its shell is on screen. */
export function useRememberPlace(userId: string, place: Place): void {
  useEffect(() => {
    writeStored(key(userId), place);
  }, [userId, place]);
}

/** Where to land after signing in: the remembered place if they still have it, else the staff app. */
export function homeFor(
  session: Pick<Session, 'user' | 'ownerOf'> & { tenantOf?: Session['tenantOf'] },
  remembered: Place | null,
): '/app' | '/admin' | '/tenant' | '/owner' {
  if (remembered === 'admin' && isPlatformOperator(session.user)) return '/admin';
  if (remembered === 'tenant' && (session.tenantOf?.length ?? 0) > 0) return '/tenant';
  if (remembered === 'owner' && session.ownerOf.length > 0) return '/owner';
  return '/app';
}
