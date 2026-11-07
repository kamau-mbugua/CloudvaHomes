import type { BookingStatus } from '../../../generated/prisma/client.js';

export const BLOCKING: readonly BookingStatus[] = [
  'HELD',
  'REQUESTED',
  'CONFIRMED',
  'CHECKED_IN',
] as const;

const ALLOWED_MOVES: Record<BookingStatus, readonly BookingStatus[]> = {
  HELD: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
  REQUESTED: ['HELD', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['COMPLETED'],
  COMPLETED: [],
  EXPIRED: [],
  DECLINED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canMove(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_MOVES[from]?.includes(to) ?? false;
}
