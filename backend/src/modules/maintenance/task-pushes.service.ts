import { Inject, Injectable } from '@nestjs/common';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { type OrgStatus, Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SLA_HOURS } from './sla.js';
import {
  becameLateInLast24h,
  canReceive,
  formatPeriodLabel,
  isFirstOfMonth,
  nairobiDay,
  periodFromDay,
  type PushMembership,
  recentlyOverdueWhere,
} from './task-pushes.rules.js';

export type TaskPushKind = 'METER_READINGS_DUE' | 'FINAL_METER_READING' | 'MAINTENANCE_LATE';

const EXCLUDED_ORG_STATUSES: OrgStatus[] = ['CLOSED', 'SUSPENDED'];

interface OrgMembershipRow extends PushMembership {
  orgId: string;
  userId: string;
}

@Injectable()
export class TaskPushesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  async runCaretakerDaily(
    todayRaw?: string,
  ): Promise<{ readingsDue: number; finalReadings: number }> {
    const today = todayRaw ?? nairobiDay();
    let todayDate: Date;
    try {
      todayDate = parseDateOnly(today);
    } catch {
      throw AppError.fieldInvalid('today', 'today must be a real date like 2026-12-01');
    }

    let readingsDue = 0;
    if (isFirstOfMonth(today)) {
      readingsDue = await this.sendMeterReadingsDue(periodFromDay(today));
    }
    const finalReadings = await this.sendFinalMeterReadings(todayDate);
    return { readingsDue, finalReadings };
  }

  async runMaintenanceLate(nowRaw?: string): Promise<{ late: number }> {
    const now = nowRaw ? new Date(nowRaw) : new Date();
    if (Number.isNaN(now.getTime())) {
      throw AppError.fieldInvalid('now', 'now must be a valid ISO timestamp');
    }

    const requests = await withoutOrgScope(() =>
      this.db.maintenanceRequest.findMany({
        where: {
          AND: [
            recentlyOverdueWhere(now),
            {
              property: {
                organization: { status: { notIn: EXCLUDED_ORG_STATUSES } },
              },
            },
          ],
        },
        select: {
          id: true,
          orgId: true,
          propertyId: true,
          priority: true,
          status: true,
          title: true,
          createdAt: true,
          unit: { select: { number: true } },
          property: { select: { name: true } },
        },
      }),
    );

    const eligible = requests.filter((r) => becameLateInLast24h(r, now));
    if (!eligible.length) return { late: 0 };

    const membersByOrg = await this.loadMemberships([...new Set(eligible.map((r) => r.orgId))]);

    let late = 0;
    for (const r of eligible) {
      if (!(await this.claim(r.orgId, 'MAINTENANCE_LATE', r.id))) continue;
      const recipients = this.recipientsFor(membersByOrg.get(r.orgId) ?? [], 'maintenance:update', [
        r.propertyId,
      ]);
      const hours = SLA_HOURS[r.priority];
      for (const userId of recipients) {
        await this.notifications.notifyUser({
          userId,
          orgId: r.orgId,
          kind: 'MAINTENANCE_LATE',
          title: 'Repair is late',
          body: `${r.title} — ${r.property.name} Unit ${r.unit.number} is past its ${hours}-hour target.`,
          actionUrl: '/app/maintenance?late=true',
        });
        late++;
      }
    }
    return { late };
  }

  private async sendMeterReadingsDue(period: string): Promise<number> {
    const meters = await withoutOrgScope(() =>
      this.db.meter.findMany({
        where: {
          status: 'ACTIVE',
          unit: {
            property: {
              organization: { status: { notIn: EXCLUDED_ORG_STATUSES } },
            },
          },
        },
        select: {
          orgId: true,
          unit: { select: { propertyId: true } },
        },
      }),
    );
    if (!meters.length) return 0;

    const propsByOrg = new Map<string, Set<string>>();
    for (const m of meters) {
      let set = propsByOrg.get(m.orgId);
      if (!set) {
        set = new Set<string>();
        propsByOrg.set(m.orgId, set);
      }
      set.add(m.unit.propertyId);
    }

    const membersByOrg = await this.loadMemberships([...propsByOrg.keys()]);
    const label = formatPeriodLabel(period);
    let sent = 0;

    for (const [orgId, propSet] of propsByOrg) {
      if (!(await this.claim(orgId, 'METER_READINGS_DUE', period))) continue;
      const recipients = this.recipientsFor(membersByOrg.get(orgId) ?? [], 'meters:create', [
        ...propSet,
      ]);
      for (const userId of recipients) {
        await this.notifications.notifyUser({
          userId,
          orgId,
          kind: 'METER_READINGS_DUE',
          title: 'Meter readings due',
          body: `Meter readings for ${label} are due.`,
          actionUrl: '/app/meter-readings',
        });
        sent++;
      }
    }
    return sent;
  }

  private async sendFinalMeterReadings(todayDate: Date): Promise<number> {
    const tenancies = await withoutOrgScope(() =>
      this.db.tenancy.findMany({
        where: {
          status: 'NOTICE',
          endDate: todayDate,
          unit: {
            meters: { some: { status: 'ACTIVE' } },
            property: {
              organization: { status: { notIn: EXCLUDED_ORG_STATUSES } },
            },
          },
        },
        select: {
          id: true,
          orgId: true,
          unitId: true,
          unit: {
            select: {
              number: true,
              propertyId: true,
              property: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!tenancies.length) return 0;

    const membersByOrg = await this.loadMemberships([...new Set(tenancies.map((t) => t.orgId))]);

    let sent = 0;
    for (const t of tenancies) {
      if (!(await this.claim(t.orgId, 'FINAL_METER_READING', t.id))) continue;
      const recipients = this.recipientsFor(membersByOrg.get(t.orgId) ?? [], 'meters:create', [
        t.unit.propertyId,
      ]);
      for (const userId of recipients) {
        await this.notifications.notifyUser({
          userId,
          orgId: t.orgId,
          kind: 'FINAL_METER_READING',
          title: 'Final meter reading',
          body: `Take the final meter reading for ${t.unit.property.name} Unit ${t.unit.number}. The tenant moves out today.`,
          actionUrl: `/app/units/${t.unitId}`,
        });
        sent++;
      }
    }
    return sent;
  }

  private async loadMemberships(orgIds: string[]): Promise<Map<string, OrgMembershipRow[]>> {
    if (!orgIds.length) return new Map();
    const rows = await withoutOrgScope(() =>
      this.db.membership.findMany({
        where: {
          orgId: { in: orgIds },
          status: 'ACTIVE',
          user: { status: 'ACTIVE', deletedAt: null },
          organization: { status: { notIn: EXCLUDED_ORG_STATUSES } },
        },
        select: {
          orgId: true,
          userId: true,
          status: true,
          propertyIds: true,
          role: { select: { systemKey: true, permissions: true } },
        },
      }),
    );
    const byOrg = new Map<string, OrgMembershipRow[]>();
    for (const r of rows) {
      const list = byOrg.get(r.orgId);
      if (list) {
        list.push(r);
      } else {
        byOrg.set(r.orgId, [r]);
      }
    }
    return byOrg;
  }

  private recipientsFor(
    members: readonly OrgMembershipRow[],
    permission: string,
    propertyIds: readonly string[],
  ): string[] {
    const userIds = new Set<string>();
    for (const m of members) {
      if (propertyIds.some((pid) => canReceive(m, permission, pid))) {
        userIds.add(m.userId);
      }
    }
    return [...userIds];
  }

  private async claim(orgId: string, kind: TaskPushKind, refKey: string): Promise<boolean> {
    try {
      await withoutOrgScope(() =>
        this.db.taskPush.create({
          data: { orgId, kind, refKey },
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return false;
      }
      throw e;
    }
  }
}
