/**
 * A member's property limit (`Membership.propertyIds`), where an empty list means every
 * property. The ids to send: `[]` for all properties; an error when "Only some" has none
 * ticked, since sending `[]` then would quietly grant everything.
 */
export function propertyAccessValue(limited: boolean, ids: string[]): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!limited) return { ok: true, ids: [] };
  if (ids.length === 0) return { ok: false, error: 'Tick at least one property, or choose All properties.' };
  return { ok: true, ids };
}
