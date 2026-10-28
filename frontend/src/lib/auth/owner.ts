import { landingFor } from './portals';
import type { OwnerOf, Session } from './types';

/**
 * Landlords of an agency (phase 6b) sign in like anyone else but usually have no
 * organisation of their own: what they get is the read-only owner portal (`/owner`) for
 * the landlord profiles in `session.ownerOf`.
 */

/**
 * True when the person should be sent to the owner portal instead of the org app. A
 * landlord who is also a tenant somewhere is asked which portal (see `landingFor`).
 */
export function belongsInOwnerPortal(session: Pick<Session, 'activeOrganization' | 'organizations' | 'ownerOf'> & { tenantOf?: Session['tenantOf'] }): boolean {
  return landingFor(session) === '/owner';
}

/** The landlord profile to show: the one asked for if the person owns it, else the first. */
export function pickOwnerProfile(ownerOf: readonly OwnerOf[], wanted: string | null | undefined): OwnerOf | null {
  return ownerOf.find((o) => o.landlordId === wanted) ?? ownerOf[0] ?? null;
}
