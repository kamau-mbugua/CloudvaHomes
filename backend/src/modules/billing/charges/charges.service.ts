import { Inject, Injectable } from '@nestjs/common';
import { AppError, type ErrorDetail } from '../../../common/errors/app-error.js';
import type { ChargeType, MoveInCharge } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { optionalText } from '../../portfolio/fields.js';
import { PropertiesService } from '../../portfolio/properties/properties.service.js';
import { propertyScope } from '../../portfolio/property-scope.js';
import type {
  ChargeEntriesQueryDto,
  CreateChargeTypeDto,
  CreateMoveInChargeDto,
  ListChargesQueryDto,
  SaveChargeEntriesDto,
  UpdateChargeTypeDto,
  UpdateMoveInChargeDto,
} from './charges.dto.js';

const PROPERTY = { property: { select: { id: true, code: true, name: true } } } as const;

type ChargeRow = ChargeType & {
  property: { id: string; code: string; name: string };
  _count: { meters: number };
};

function chargeSnapshot(c: ChargeType) {
  return {
    propertyId: c.propertyId,
    name: c.name,
    kind: c.kind,
    amount: c.amount,
    unitRate: c.unitRate,
    unitLabel: c.unitLabel,
    unitIds: c.unitIds,
    status: c.status,
  };
}

function toCharge(c: ChargeRow) {
  return {
    id: c.id,
    property: c.property,
    name: c.name,
    kind: c.kind,
    amount: c.amount,
    unitRate: c.unitRate,
    unitLabel: c.unitLabel,
    unitIds: c.unitIds,
    status: c.status,
    meterCount: c._count.meters,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function moveInSnapshot(c: MoveInCharge) {
  return {
    propertyId: c.propertyId,
    name: c.name,
    kind: c.kind,
    amount: c.amount,
    rentMonths: c.rentMonths,
    refundable: c.refundable,
    status: c.status,
  };
}

function toMoveIn(c: MoveInCharge & { property: { id: string; code: string; name: string } }) {
  return {
    id: c.id,
    property: c.property,
    name: c.name,
    kind: c.kind,
    amount: c.amount,
    rentMonths: c.rentMonths,
    refundable: c.refundable,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

const nameTaken = () =>
  AppError.conflict('This property already has a charge with that name', 'NAME_TAKEN');

/**
 * What a property bills besides rent: recurring charge types (fixed, variable, metered),
 * one-off move-in charges, and the monthly amounts of variable charges.
 */
@Injectable()
export class ChargesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly properties: PropertiesService,
  ) {}

  // ── Charge types ──

  async listChargeTypes(q: ListChargesQueryDto) {
    const rows = await this.db.chargeType.findMany({
      where: {
        property: propertyScope(),
        ...(q.propertyId ? { propertyId: q.propertyId } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      include: { ...PROPERTY, _count: { select: { meters: true } } },
      orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(toCharge);
  }

  async createChargeType(dto: CreateChargeTypeDto) {
    const { orgId } = orgContext();
    await this.properties.find(dto.propertyId);
    const details: ErrorDetail[] = [];
    if (dto.kind === 'FIXED' && dto.amount === undefined) {
      details.push({ field: 'amount', message: 'Enter the monthly amount' });
    }
    if (dto.kind === 'METERED' && dto.unitRate === undefined) {
      details.push({ field: 'unitRate', message: 'Enter the price per unit' });
    }
    if (details.length) throw AppError.validation(details);
    const unitIds = await this.checkUnits(dto.propertyId, dto.unitIds ?? []);
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.chargeType.create({
          data: {
            orgId,
            propertyId: dto.propertyId,
            name: dto.name.trim(),
            kind: dto.kind,
            amount: dto.kind === 'FIXED' ? BigInt(dto.amount!) : null,
            unitRate: dto.kind === 'METERED' ? BigInt(dto.unitRate!) : null,
            unitLabel: dto.kind === 'METERED' ? (optionalText(dto.unitLabel) ?? null) : null,
            unitIds,
          },
          include: { ...PROPERTY, _count: { select: { meters: true } } },
        });
        await this.audit.record(
          {
            action: 'charge_type.create',
            entity: 'charge_type',
            entityId: row.id,
            after: chargeSnapshot(row),
          },
          tx,
        );
        return toCharge(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'name')) throw nameTaken();
      throw e;
    }
  }

  async updateChargeType(id: string, dto: UpdateChargeTypeDto) {
    const before = await this.findChargeType(id);
    if (dto.amount !== undefined && before.kind !== 'FIXED') {
      throw AppError.fieldInvalid('amount', 'Only fixed charges have a monthly amount');
    }
    if (dto.unitRate !== undefined && before.kind !== 'METERED') {
      throw AppError.fieldInvalid('unitRate', 'Only metered charges have a unit price');
    }
    const unitIds =
      dto.unitIds !== undefined ? await this.checkUnits(before.propertyId, dto.unitIds) : undefined;
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.chargeType.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.amount !== undefined ? { amount: BigInt(dto.amount) } : {}),
            ...(dto.unitRate !== undefined ? { unitRate: BigInt(dto.unitRate) } : {}),
            ...(dto.unitLabel !== undefined && before.kind === 'METERED'
              ? { unitLabel: optionalText(dto.unitLabel) }
              : {}),
            ...(unitIds !== undefined ? { unitIds } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
          include: { ...PROPERTY, _count: { select: { meters: true } } },
        });
        await this.audit.record(
          {
            action: 'charge_type.update',
            entity: 'charge_type',
            entityId: id,
            before: chargeSnapshot(before),
            after: chargeSnapshot(row),
          },
          tx,
        );
        return toCharge(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'name')) throw nameTaken();
      throw e;
    }
  }

  async removeChargeType(id: string) {
    const before = await this.findChargeType(id);
    const [billed, entries] = await Promise.all([
      this.db.invoiceLine.count({ where: { chargeTypeId: id } }),
      this.db.chargeEntry.count({ where: { chargeTypeId: id } }),
    ]);
    if (billed || entries || before._count.meters) {
      throw AppError.conflict(
        'This charge has been billed or has meters or amounts. Mark it inactive instead.',
        'IN_USE',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.chargeType.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'charge_type.delete',
          entity: 'charge_type',
          entityId: id,
          before: chargeSnapshot(before),
        },
        tx,
      );
    });
  }

  /** A charge type on a property the caller may see, or 404. */
  async findChargeType(id: string): Promise<ChargeRow> {
    const c = await this.db.chargeType.findFirst({
      where: { id, property: propertyScope() },
      include: { ...PROPERTY, _count: { select: { meters: true } } },
    });
    if (!c) throw AppError.notFound('Charge');
    return c;
  }

  // ── Move-in charges ──

  async listMoveInCharges(q: ListChargesQueryDto) {
    const rows = await this.db.moveInCharge.findMany({
      where: {
        property: propertyScope(),
        ...(q.propertyId ? { propertyId: q.propertyId } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      include: PROPERTY,
      orderBy: [{ property: { name: 'asc' } }, { kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toMoveIn);
  }

  async createMoveInCharge(dto: CreateMoveInChargeDto) {
    const { orgId } = orgContext();
    await this.properties.find(dto.propertyId);
    if ((dto.amount === undefined) === (dto.rentMonths === undefined)) {
      throw AppError.fieldInvalid('amount', 'Enter a fixed amount or a number of months’ rent');
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.moveInCharge.create({
          data: {
            orgId,
            propertyId: dto.propertyId,
            name: dto.name.trim(),
            kind: dto.kind,
            amount: dto.amount !== undefined ? BigInt(dto.amount) : null,
            rentMonths: dto.rentMonths ?? null,
            refundable: dto.refundable ?? dto.kind === 'DEPOSIT',
          },
          include: PROPERTY,
        });
        await this.audit.record(
          {
            action: 'move_in_charge.create',
            entity: 'move_in_charge',
            entityId: row.id,
            after: moveInSnapshot(row),
          },
          tx,
        );
        return toMoveIn(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'name')) throw nameTaken();
      throw e;
    }
  }

  async updateMoveInCharge(id: string, dto: UpdateMoveInChargeDto) {
    const before = await this.findMoveInCharge(id);
    if (dto.amount !== undefined && dto.rentMonths !== undefined) {
      throw AppError.fieldInvalid('amount', 'Enter a fixed amount or a number of months’ rent');
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.moveInCharge.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.amount !== undefined ? { amount: BigInt(dto.amount), rentMonths: null } : {}),
            ...(dto.rentMonths !== undefined ? { rentMonths: dto.rentMonths, amount: null } : {}),
            ...(dto.refundable !== undefined ? { refundable: dto.refundable } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
          include: PROPERTY,
        });
        await this.audit.record(
          {
            action: 'move_in_charge.update',
            entity: 'move_in_charge',
            entityId: id,
            before: moveInSnapshot(before),
            after: moveInSnapshot(row),
          },
          tx,
        );
        return toMoveIn(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'name')) throw nameTaken();
      throw e;
    }
  }

  async removeMoveInCharge(id: string) {
    const before = await this.findMoveInCharge(id);
    if (await this.db.invoiceLine.count({ where: { moveInChargeId: id } })) {
      throw AppError.conflict('This charge has been billed. Mark it inactive instead.', 'IN_USE');
    }
    await this.db.$transaction(async (tx) => {
      await tx.moveInCharge.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'move_in_charge.delete',
          entity: 'move_in_charge',
          entityId: id,
          before: moveInSnapshot(before),
        },
        tx,
      );
    });
  }

  private async findMoveInCharge(id: string) {
    const c = await this.db.moveInCharge.findFirst({
      where: { id, property: propertyScope() },
      include: PROPERTY,
    });
    if (!c) throw AppError.notFound('Move-in charge');
    return c;
  }

  // ── Variable amounts ──

  async listEntries(q: ChargeEntriesQueryDto) {
    const charge = await this.variableCharge(q.chargeTypeId);
    const units = await this.unitsOf(charge);
    const entries = await this.db.chargeEntry.findMany({
      where: { chargeTypeId: charge.id, period: q.period },
    });
    const byUnit = new Map(entries.map((e) => [e.unitId, e]));
    return units.map((u) => {
      const e = byUnit.get(u.id);
      return { unit: u, amount: e?.amount ?? null, billed: !!e?.invoiceId };
    });
  }

  /** Upserts (amount) or deletes (null) entries. Touching a billed one fails the whole save. */
  async saveEntries(dto: SaveChargeEntriesDto) {
    const { orgId } = orgContext();
    const charge = await this.variableCharge(dto.chargeTypeId);
    const allowed = new Set((await this.unitsOf(charge)).map((u) => u.id));
    const bad = dto.entries.findIndex((e) => !allowed.has(e.unitId));
    if (bad >= 0) {
      throw AppError.fieldInvalid(`entries[${bad}].unitId`, 'This unit doesn’t have this charge');
    }
    await this.db.$transaction(async (tx) => {
      const existing = await tx.chargeEntry.findMany({
        where: { chargeTypeId: charge.id, period: dto.period, unitId: { in: [...allowed] } },
      });
      const byUnit = new Map(existing.map((e) => [e.unitId, e]));
      for (const e of dto.entries) {
        const old = byUnit.get(e.unitId);
        const next = e.amount === null || e.amount === undefined ? null : BigInt(e.amount);
        if (old?.invoiceId && old.amount !== next) throw alreadyBilled();
        if (old?.invoiceId) continue;
        if (next === null) {
          if (old) await tx.chargeEntry.delete({ where: { id: old.id } });
        } else {
          await tx.chargeEntry.upsert({
            where: {
              chargeTypeId_unitId_period: {
                chargeTypeId: charge.id,
                unitId: e.unitId,
                period: dto.period,
              },
            },
            create: {
              orgId,
              chargeTypeId: charge.id,
              unitId: e.unitId,
              period: dto.period,
              amount: next,
            },
            update: { amount: next },
          });
        }
      }
      await this.audit.record(
        {
          action: 'charge_entry.save',
          entity: 'charge_type',
          entityId: charge.id,
          after: {
            period: dto.period,
            entries: dto.entries.map((e) => ({ unitId: e.unitId, amount: e.amount ?? null })),
          },
        },
        tx,
      );
    });
    return this.listEntries({ chargeTypeId: charge.id, period: dto.period });
  }

  private async variableCharge(id: string) {
    const c = await this.findChargeType(id);
    if (c.kind !== 'VARIABLE') {
      throw AppError.fieldInvalid('chargeTypeId', 'Choose a variable charge');
    }
    return c;
  }

  /** The units a charge applies to: its chosen units, or every unit of the property. */
  async unitsOf(c: Pick<ChargeType, 'propertyId' | 'unitIds'>) {
    return this.db.unit.findMany({
      where: {
        propertyId: c.propertyId,
        ...(c.unitIds.length ? { id: { in: c.unitIds } } : {}),
      },
      select: { id: true, number: true },
      orderBy: { number: 'asc' },
    });
  }

  private async checkUnits(propertyId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return unique;
    const found = await this.db.unit.count({ where: { propertyId, id: { in: unique } } });
    if (found !== unique.length) {
      throw AppError.fieldInvalid('unitIds', 'Choose units of this property');
    }
    return unique;
  }
}

export const alreadyBilled = () =>
  AppError.conflict(
    'Some of these figures are already on an invoice. Void that invoice to change them.',
    'ALREADY_BILLED',
  );
