/**
 * The Today board's "In-house": guests who are in the property now — checked in, or a confirmed
 * stay that began before today but was never checked in. Today's arrivals who haven't checked in
 * yet are listed under Arrivals only.
 */
export function isInHouse(b: { status: string; checkIn: string; checkOut: string }, today: string): boolean {
  if (b.status === 'CHECKED_IN') return true;
  return b.status === 'CONFIRMED' && b.checkIn < today && b.checkOut > today;
}
