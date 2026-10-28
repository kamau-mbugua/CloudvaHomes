import { Inject, Injectable } from '@nestjs/common';
import { AppError, type ErrorDetail } from '../../../common/errors/app-error.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { propertyScope, unitScope } from '../../portfolio/property-scope.js';
import { UnitsService } from '../../portfolio/units/units.service.js';
import { fromMilli, meteredAmount, toMilli } from '../billing-math.js';
import { UploadsService } from '../../files/uploads.service.js';
import { alreadyBilled, ChargesService } from '../charges/charges.service.js';
import type {
  CreateMeterDto,
  ListMetersQueryDto,
  ReadingSheetQueryDto,
  SaveReadingsDto,
  UpdateMeterDto,
} from './meters.dto.js';

const METER_INCLUDE = {
  unit: {
    select: { id: true, number: true, property: { select: { id: true, code: true, name: true } } },
  },
  chargeType: { select: { id: true, name: true, unitLabel: true, unitRate: true } },
  readings: { orderBy: { period: 'desc' }, take: 1, select: { period: true, current: true } },
} satisfies Prisma.MeterInclude;

type MeterRow = Prisma.MeterGetPayload<{ include: typeof METER_INCLUDE }>;

/** Prisma Decimal → our exact 3-dp string. */
const q = (d: { toFixed(n: number): string }) => d.toFixed(3);

function toMeter(m: MeterRow) {
  const last = m.readings[0];
  return {
    id: m.id,
    serialNo: m.serialNo,
    initialReading: q(m.initialReading),
    status: m.status,
    unit: { id: m.unit.id, number: m.unit.number },
    property: m.unit.property,
    chargeType: { id: m.chargeType.id, name: m.chargeType.name, unitLabel: m.chargeType.unitLabel },
    lastReading: last ? { period: last.period, current: q(last.current) } : null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

const serialTaken = () =>
  AppError.conflict('Another meter already has this serial number', 'SERIAL_TAKEN');

/** Meters on units, and their monthly readings (the input to metered charge lines). */
@Injectable()
export class MetersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    private readonly charges: ChargesService,
    private readonly uploads: UploadsService,
  ) {}

  async list(qry: ListMetersQueryDto) {
    const rows = await this.db.meter.findMany({
      where: {
        unit: {
          ...unitScope(),
          ...(qry.propertyId ? { propertyId: qry.propertyId } : {}),
        },
        ...(qry.unitId ? { unitId: qry.unitId } : {}),
        ...(qry.chargeTypeId ? { chargeTypeId: qry.chargeTypeId } : {}),
      },
      include: METER_INCLUDE,
      orderBy: [{ unit: { number: 'asc' } }, { chargeType: { name: 'asc' } }],
    });
    return rows.map(toMeter);
  }

  async create(dto: CreateMeterDto) {
    const { orgId } = orgContext();
    const unit = await this.units.find(dto.unitId);
    const charge = await this.charges.findChargeType(dto.chargeTypeId);
    if (charge.kind !== 'METERED' || charge.propertyId !== unit.propertyId) {
      throw AppError.fieldInvalid(
        'chargeTypeId',
        'Choose a metered charge of this unit’s property',
      );
    }
    try {
      return await this.db.$transaction(async (tx) => {
        if (await tx.meter.count({ where: { unitId: unit.id, chargeTypeId: charge.id } })) {
          throw AppError.conflict('This unit already has a meter for this charge', 'METER_EXISTS');
        }
        const row = await tx.meter.create({
          data: {
            orgId,
            unitId: unit.id,
            chargeTypeId: charge.id,
            serialNo: dto.serialNo.trim(),
            initialReading: fromMilli(toMilli(dto.initialReading ?? '0')),
          },
          include: METER_INCLUDE,
        });
        await this.audit.record(
          {
            action: 'meter.create',
            entity: 'meter',
            entityId: row.id,
            after: {
              unitId: unit.id,
              chargeTypeId: charge.id,
              serialNo: row.serialNo,
              initialReading: q(row.initialReading),
            },
          },
          tx,
        );
        return toMeter(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'serialNo')) throw serialTaken();
      throw e;
    }
  }

  async update(id: string, dto: UpdateMeterDto) {
    const before = await this.find(id);
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.meter.update({
          where: { id },
          data: {
            ...(dto.serialNo !== undefined ? { serialNo: dto.serialNo.trim() } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
          include: METER_INCLUDE,
        });
        await this.audit.record(
          {
            action: 'meter.update',
            entity: 'meter',
            entityId: id,
            before: { serialNo: before.serialNo, status: before.status },
            after: { serialNo: row.serialNo, status: row.status },
          },
          tx,
        );
        return toMeter(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'serialNo')) throw serialTaken();
      throw e;
    }
  }

  async remove(id: string) {
    const before = await this.find(id);
    if (await this.db.meterReading.count({ where: { meterId: id } })) {
      throw AppError.conflict('This meter has readings. Mark it inactive instead.', 'IN_USE');
    }
    await this.db.$transaction(async (tx) => {
      await tx.meter.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'meter.delete',
          entity: 'meter',
          entityId: id,
          before: { serialNo: before.serialNo, unitId: before.unitId },
        },
        tx,
      );
    });
  }

  /**
   * One row per active meter of a metered charge for the month: the suggested previous
   * reading (last reading before this month, else the meter's initial reading) and this
   * month's reading if entered.
   */
  async sheet(qry: ReadingSheetQueryDto) {
    const charge = await this.charges.findChargeType(qry.chargeTypeId);
    if (charge.kind !== 'METERED' || charge.propertyId !== qry.propertyId) {
      throw AppError.fieldInvalid('chargeTypeId', 'Choose a metered charge of this property');
    }
    const meters = await this.db.meter.findMany({
      where: { chargeTypeId: charge.id, status: 'ACTIVE', unit: unitScope() },
      include: {
        unit: { select: { id: true, number: true } },
        readings: {
          where: { period: { lte: qry.period } },
          orderBy: { period: 'desc' },
          take: 2,
        },
      },
      orderBy: { unit: { number: 'asc' } },
    });
    const readerIds = [
      ...new Set(
        meters.flatMap((m) =>
          m.readings.filter((r) => r.period === qry.period).map((r) => r.readById),
        ),
      ),
    ];
    const readers = readerIds.length
      ? await this.db.user.findMany({
          where: { id: { in: readerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(readers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const rate = charge.unitRate ?? 0n;
    return meters.map((m) => {
      const current = m.readings.find((r) => r.period === qry.period);
      const earlier = m.readings.find((r) => r.period < qry.period);
      const consumption = current
        ? toMilli(q(current.current)) - toMilli(q(current.previous))
        : null;
      return {
        meter: { id: m.id, serialNo: m.serialNo },
        unit: m.unit,
        suggestedPrevious: earlier ? q(earlier.current) : q(m.initialReading),
        reading: current
          ? {
              id: current.id,
              previous: q(current.previous),
              current: q(current.current),
              consumption: fromMilli(consumption!),
              amount: meteredAmount(consumption!, rate),
              note: current.note,
              billed: !!current.invoiceId,
              photo: current.photoUploadId ? { id: current.photoUploadId } : null,
              readAt: current.readAt,
              readBy: { id: current.readById, name: names.get(current.readById) ?? 'Unknown user' },
            }
          : null,
      };
    });
  }

  /** Upserts readings for the month. All rows are checked first; one bad row saves nothing. */
  async save(dto: SaveReadingsDto) {
    const ctx = orgContext();
    const meterIds = [...new Set(dto.readings.map((r) => r.meterId))];
    const meters = await this.db.meter.findMany({
      where: { id: { in: meterIds }, unit: unitScope() },
      include: {
        readings: { where: { period: { lte: dto.period } }, orderBy: { period: 'desc' }, take: 2 },
      },
    });
    const byId = new Map(meters.map((m) => [m.id, m]));
    const details: ErrorDetail[] = [];
    const plan = dto.readings.map((r, i) => {
      const m = byId.get(r.meterId);
      if (!m) {
        details.push({ field: `readings[${i}].meterId`, message: 'Meter not found' });
        return null;
      }
      const existing = m.readings.find((x) => x.period === dto.period);
      const earlier = m.readings.find((x) => x.period < dto.period);
      // Correcting a reading keeps its previous value (it may have been set by hand after a
      // meter swap) unless a new one is given.
      const previous = toMilli(
        r.previous ??
          (existing ? q(existing.previous) : earlier ? q(earlier.current) : q(m.initialReading)),
      );
      const current = toMilli(r.current);
      if (current < previous) {
        details.push({
          field: `readings[${i}].current`,
          message: `Must be at least the previous reading (${fromMilli(previous)})`,
        });
      }
      if (existing?.invoiceId) throw alreadyBilled();
      const newPhoto =
        r.photoUploadId && r.photoUploadId !== existing?.photoUploadId ? r.photoUploadId : null;
      return {
        meterId: m.id,
        previous,
        current,
        note: r.note?.trim() || null,
        photo: newPhoto ? { id: newPhoto, field: `readings[${i}].photoUploadId` } : null,
      };
    });
    if (details.length) throw AppError.validation(details);

    await this.db.$transaction(async (tx) => {
      for (const p of plan) {
        if (p!.photo) await this.uploads.attach(tx, p!.photo.id, 'METER_PHOTO', p!.photo.field);
        const data = {
          previous: fromMilli(p!.previous),
          current: fromMilli(p!.current),
          note: p!.note,
          readById: ctx.userId,
          readAt: new Date(),
          ...(p!.photo ? { photoUploadId: p!.photo.id } : {}),
        };
        await tx.meterReading.upsert({
          where: { meterId_period: { meterId: p!.meterId, period: dto.period } },
          create: { orgId: ctx.orgId, meterId: p!.meterId, period: dto.period, ...data },
          update: data,
        });
      }
      await this.audit.record(
        {
          action: 'meter_reading.save',
          entity: 'meter_reading',
          after: {
            period: dto.period,
            readings: plan.map((p) => ({
              meterId: p!.meterId,
              previous: fromMilli(p!.previous),
              current: fromMilli(p!.current),
            })),
          },
        },
        tx,
      );
    });
    return { saved: plan.length };
  }

  async removeReading(id: string) {
    const r = await this.db.meterReading.findFirst({ where: { id, meter: { unit: unitScope() } } });
    if (!r) throw AppError.notFound('Reading');
    if (r.invoiceId) throw alreadyBilled();
    await this.db.$transaction(async (tx) => {
      await tx.meterReading.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'meter_reading.delete',
          entity: 'meter_reading',
          entityId: id,
          before: {
            meterId: r.meterId,
            period: r.period,
            previous: q(r.previous),
            current: q(r.current),
          },
        },
        tx,
      );
    });
  }

  /** The upload id of a reading's photo (caller may see the meter), or 404. */
  async photoUploadId(readingId: string): Promise<string> {
    const r = await this.db.meterReading.findFirst({
      where: { id: readingId, meter: { unit: unitScope() } },
      select: { photoUploadId: true },
    });
    if (!r?.photoUploadId) throw AppError.notFound('Photo');
    return r.photoUploadId;
  }

  private async find(id: string) {
    const m = await this.db.meter.findFirst({
      where: { id, unit: { ...unitScope(), property: propertyScope() } },
    });
    if (!m) throw AppError.notFound('Meter');
    return m;
  }
}
