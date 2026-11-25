import { parseDateOnly } from '../../common/dates/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { nairobiToday } from '../stays/bookings/booking-view.js';
import { isOverdue, SLA_HOURS } from './sla.js';

export interface PushMembership {
  status: string;
  propertyIds: readonly string[];
  role: {
    systemKey: string | null;
    permissions: readonly string[];
  };
}

/**
 * Active organisation member who holds `permission` (Owner holds all) and can see `propertyId`
 * (Owner or empty `propertyIds` = all properties).
 */
export function canReceive(
  membership: PushMembership,
  permission: string,
  propertyId: string,
): boolean {
  if (membership.status !== 'ACTIVE') return false;
  const isOwner = membership.role.systemKey === 'OWNER';
  if (!isOwner && !membership.role.permissions.includes(permission)) {
    return false;
  }
  return (
    isOwner || membership.propertyIds.length === 0 || membership.propertyIds.includes(propertyId)
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const LATE_PUSH_WINDOW_MS = 24 * 3_600_000;

export function nairobiDay(now: Date = new Date()): string {
  return nairobiToday(now);
}

export function isFirstOfMonth(dayOrNow: string | Date): boolean {
  const day = typeof dayOrNow === 'string' ? dayOrNow : nairobiToday(dayOrNow);
  parseDateOnly(day);
  return day.endsWith('-01');
}

export function periodFromDay(day: string): string {
  parseDateOnly(day);
  return day.slice(0, 7);
}

/** "2026-12" → "December 2026". */
export function formatPeriodLabel(period: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!m) throw new RangeError(`Not a period: "${period}"`);
  const year = m[1]!;
  const monthIdx = Number(m[2]!) - 1;
  return `${MONTH_NAMES[monthIdx]!} ${year}`;
}

type Priority = keyof typeof SLA_HOURS;

/**
 * Open or in-progress request whose SLA target passed within the last 24 hours:
 * `now - 24h <= createdAt + SLA < now`.
 */
export function becameLateInLast24h(
  p: { priority: Priority; status: string; createdAt: Date },
  now: Date,
): boolean {
  if (!isOverdue(p, now)) return false;
  const lateAtMs = p.createdAt.getTime() + SLA_HOURS[p.priority] * 3_600_000;
  return now.getTime() - lateAtMs <= LATE_PUSH_WINDOW_MS;
}

export function recentlyOverdueWhere(now: Date): Prisma.MaintenanceRequestWhereInput {
  return {
    status: { in: ['OPEN', 'IN_PROGRESS'] },
    OR: (Object.keys(SLA_HOURS) as Priority[]).map((priority) => {
      const slaMs = SLA_HOURS[priority] * 3_600_000;
      return {
        priority,
        createdAt: {
          gte: new Date(now.getTime() - slaMs - LATE_PUSH_WINDOW_MS),
          lt: new Date(now.getTime() - slaMs),
        },
      };
    }),
  };
}
