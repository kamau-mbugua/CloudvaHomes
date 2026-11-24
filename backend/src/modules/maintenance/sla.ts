import type { Prisma } from '../../generated/prisma/client.js';

/** Hours to resolve a job by priority (phase 18): later than this, it's late. */
export const SLA_HOURS = { URGENT: 24, HIGH: 72, MEDIUM: 168, LOW: 336 } as const;
type Priority = keyof typeof SLA_HOURS;

export function isOverdue(
  p: { priority: Priority; status: string; createdAt: Date },
  now: Date,
): boolean {
  if (p.status !== 'OPEN' && p.status !== 'IN_PROGRESS') return false;
  return now.getTime() - p.createdAt.getTime() > SLA_HOURS[p.priority] * 3_600_000;
}

/** The same rule as a query: open jobs older than their priority allows. */
export function overdueWhere(now: Date): Prisma.MaintenanceRequestWhereInput {
  return {
    status: { in: ['OPEN', 'IN_PROGRESS'] },
    OR: (Object.keys(SLA_HOURS) as Priority[]).map((priority) => ({
      priority,
      createdAt: { lt: new Date(now.getTime() - SLA_HOURS[priority] * 3_600_000) },
    })),
  };
}
