import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { optionalText } from '../../portfolio/fields.js';
import { propertyScope } from '../../portfolio/property-scope.js';
import { nairobiToday } from '../bookings/booking-view.js';
import { assertHostOrg } from '../host-org.js';
import type {
  CompleteCleaningDto,
  CreateCleaningDto,
  ListCleaningQueryDto,
} from './cleaning.dto.js';

const CLEANING_INCLUDE = {
  unit: {
    include: {
      property: { select: { id: true, code: true, name: true } },
      listing: { select: { id: true, title: true } },
    },
  },
  booking: {
    select: {
      id: true,
      code: true,
      checkOut: true,
      checkedOutAt: true,
    },
  },
} as const;

@Injectable()
export class CleaningService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListCleaningQueryDto) {
    await assertHostOrg(this.db);
    const status = q.status ?? 'OPEN';
    const tasks = await this.db.cleaningTask.findMany({
      where: {
        status,
        unit: {
          property: propertyScope(),
          ...(q.propertyId ? { propertyId: q.propertyId } : {}),
        },
      },
      include: CLEANING_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    const unitIds = [...new Set(tasks.map((t) => t.unitId))];
    const todayDate = parseDateOnly(nairobiToday());

    const upcomingBookings = unitIds.length
      ? await this.db.booking.findMany({
          where: {
            unitId: { in: unitIds },
            kind: 'STAY',
            status: { in: ['CONFIRMED', 'HELD', 'REQUESTED'] },
            checkIn: { gte: todayDate },
          },
          select: { unitId: true, checkIn: true },
          orderBy: { checkIn: 'asc' },
        })
      : [];

    const nextCheckInByUnit = new Map<string, string>();
    for (const b of upcomingBookings) {
      if (!nextCheckInByUnit.has(b.unitId)) {
        nextCheckInByUnit.set(b.unitId, formatDateOnly(b.checkIn));
      }
    }

    const mapped = tasks.map((t) => ({
      id: t.id,
      status: t.status,
      unit: {
        id: t.unit.id,
        number: t.unit.number,
        title: t.unit.listing?.title ?? t.unit.number,
      },
      property: t.unit.property,
      booking: t.booking
        ? {
            id: t.booking.id,
            code: t.booking.code,
            checkOut: formatDateOnly(t.booking.checkOut),
          }
        : null,
      since: (t.booking?.checkedOutAt ?? t.createdAt).toISOString(),
      nextCheckIn: nextCheckInByUnit.get(t.unitId) ?? null,
      note: t.note,
      doneAt: t.doneAt ? t.doneAt.toISOString() : null,
      doneById: t.doneById,
    }));

    mapped.sort((a, b) => {
      if (a.nextCheckIn && b.nextCheckIn) {
        return a.nextCheckIn.localeCompare(b.nextCheckIn);
      }
      if (a.nextCheckIn) return -1;
      if (b.nextCheckIn) return 1;
      return a.since.localeCompare(b.since);
    });

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return {
      items: mapped.slice(start, start + pageSize),
      total: mapped.length,
    };
  }

  async create(dto: CreateCleaningDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const unit = await this.db.unit.findFirst({
      where: {
        id: dto.unitId,
        property: propertyScope(),
      },
      include: {
        property: { select: { id: true, code: true, name: true } },
        listing: { select: { id: true, title: true } },
      },
    });
    if (!unit) throw AppError.notFound('Unit');

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.cleaningTask.create({
        data: {
          orgId: ctx.orgId,
          unitId: unit.id,
          status: 'OPEN',
          note: optionalText(dto.note) ?? null,
        },
        include: CLEANING_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'cleaning.create',
          entity: 'cleaning_task',
          entityId: row.id,
          after: { unitId: row.unitId, status: row.status, note: row.note },
        },
        tx,
      );
      return row;
    });

    return {
      id: created.id,
      status: created.status,
      unit: {
        id: created.unit.id,
        number: created.unit.number,
        title: created.unit.listing?.title ?? created.unit.number,
      },
      property: created.unit.property,
      since: created.createdAt.toISOString(),
      nextCheckIn: null,
      note: created.note,
      doneAt: null,
      doneById: null,
    };
  }

  async markDone(id: string, dto: CompleteCleaningDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const task = await this.db.cleaningTask.findFirst({
      where: {
        id,
        unit: { property: propertyScope() },
      },
      include: CLEANING_INCLUDE,
    });
    if (!task) throw AppError.notFound('Cleaning task');

    const note = dto.note !== undefined ? (optionalText(dto.note) ?? null) : task.note;
    const now = new Date();

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.cleaningTask.update({
        where: { id },
        data: {
          status: 'DONE',
          doneAt: now,
          doneById: ctx.userId,
          note,
        },
        include: CLEANING_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'cleaning.done',
          entity: 'cleaning_task',
          entityId: id,
          before: { status: task.status, note: task.note },
          after: { status: row.status, note: row.note, doneAt: now.toISOString() },
        },
        tx,
      );
      return row;
    });

    return {
      id: updated.id,
      status: updated.status,
      unit: {
        id: updated.unit.id,
        number: updated.unit.number,
        title: updated.unit.listing?.title ?? updated.unit.number,
      },
      property: updated.unit.property,
      since: (updated.booking?.checkedOutAt ?? updated.createdAt).toISOString(),
      nextCheckIn: null,
      note: updated.note,
      doneAt: updated.doneAt ? updated.doneAt.toISOString() : null,
      doneById: updated.doneById,
    };
  }
}
