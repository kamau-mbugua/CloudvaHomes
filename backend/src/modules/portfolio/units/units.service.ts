import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, formatDateOnlyOrNull } from '../../../common/dates/date-only.js';
import { AppError, type ErrorDetail } from '../../../common/errors/app-error.js';
import { parseCsv, toCsv } from '../../../common/http/csv.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { optionalText } from '../fields.js';
import { PropertiesService } from '../properties/properties.service.js';
import { propertyScope, unitScope } from '../property-scope.js';
import {
  type BulkCreateUnitsDto,
  type CreateUnitDto,
  type ImportUnitsCsvDto,
  type ListUnitsQueryDto,
  MAX_BULK_UNITS,
  UNIT_NUMBER,
  type UpdateUnitDto,
} from './units.dto.js';

export const CURRENT = ['ACTIVE', 'NOTICE'] as const;

const INCLUDE = {
  property: { select: { id: true, code: true, name: true } },
  unitType: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  tenancies: {
    where: { status: { in: [...CURRENT] } },
    take: 1,
    include: {
      tenant: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
    },
  },
} satisfies Prisma.UnitInclude;

type UnitRow = Prisma.UnitGetPayload<{ include: typeof INCLUDE }>;

function snapshot(u: UnitRow) {
  return {
    propertyId: u.propertyId,
    number: u.number,
    floor: u.floor,
    sizeSqft: u.sizeSqft,
    rentAmount: u.rentAmount,
    unitTypeId: u.unitTypeId,
    categoryId: u.categoryId,
    featureIds: u.featureIds,
    description: u.description,
    status: u.status,
  };
}

/** Trimmed numbers, with in-list duplicates reported as validation errors. */
export function cleanUnitNumbers(numbers: string[]): string[] {
  const seen = new Map<string, number>();
  const details: ErrorDetail[] = [];
  const out = numbers.map((n, i) => {
    const v = n.trim();
    const first = seen.get(v.toLowerCase());
    if (first !== undefined) {
      details.push({ field: `numbers[${i}]`, message: `${v} is listed twice` });
    }
    seen.set(v.toLowerCase(), i);
    return v;
  });
  if (details.length) throw AppError.validation(details);
  return out;
}

@Injectable()
export class UnitsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly properties: PropertiesService,
    private readonly catalog: CatalogService,
  ) {}

  private async features(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db.unitFeature.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async toUnits(rows: UnitRow[]) {
    const names = await this.features([...new Set(rows.flatMap((r) => r.featureIds))]);
    return rows.map((u) => {
      const current = u.tenancies[0];
      return {
        id: u.id,
        number: u.number,
        floor: u.floor,
        sizeSqft: u.sizeSqft,
        rentAmount: u.rentAmount,
        description: u.description,
        status: u.status,
        property: u.property,
        unitType: u.unitType,
        category: u.category,
        features: u.featureIds.flatMap((id) => {
          const name = names.get(id);
          return name ? [{ id, name }] : [];
        }),
        occupancy: !current ? 'VACANT' : current.status === 'NOTICE' ? 'NOTICE' : 'OCCUPIED',
        currentTenancy: current
          ? {
              id: current.id,
              status: current.status,
              startDate: formatDateOnly(current.startDate),
              endDate: formatDateOnlyOrNull(current.endDate),
              hasSignedLease: Boolean(current.leaseUploadId),
              tenant: current.tenant,
            }
          : null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      };
    });
  }

  async list(q: ListUnitsQueryDto) {
    const term = q.q?.trim();
    const occupancy: Prisma.UnitWhereInput =
      q.occupancy === 'VACANT'
        ? { tenancies: { none: { status: { in: [...CURRENT] } } } }
        : q.occupancy
          ? { tenancies: { some: { status: q.occupancy === 'NOTICE' ? 'NOTICE' : 'ACTIVE' } } }
          : {};
    const where: Prisma.UnitWhereInput = {
      AND: [
        unitScope(),
        occupancy,
        q.propertyId ? { propertyId: q.propertyId } : {},
        q.status ? { status: q.status } : {},
        q.unitTypeId ? { unitTypeId: q.unitTypeId } : {},
        q.categoryId ? { categoryId: q.categoryId } : {},
        term
          ? {
              OR: [
                { number: { contains: term, mode: 'insensitive' } },
                {
                  tenancies: {
                    some: {
                      status: { in: [...CURRENT] },
                      tenant: {
                        OR: [
                          { firstName: { contains: term, mode: 'insensitive' } },
                          { lastName: { contains: term, mode: 'insensitive' } },
                          { phone: { contains: term.replace(/\s/g, '') } },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.unit.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ property: { name: 'asc' } }, { floor: 'asc' }, { number: 'asc' }],
        ...toSkipTake(q),
      }),
      this.db.unit.count({ where }),
    ]);
    return paginated(await this.toUnits(rows), total, q);
  }

  async get(id: string) {
    return (await this.toUnits([await this.find(id)]))[0]!;
  }

  async create(dto: CreateUnitDto) {
    const { orgId } = orgContext();
    await this.properties.find(dto.propertyId);
    await this.checkRefs(dto);
    const row = await this.write(async (tx) => {
      const created = await tx.unit.create({
        data: {
          orgId,
          propertyId: dto.propertyId,
          number: dto.number.trim(),
          floor: dto.floor ?? 0,
          sizeSqft: dto.sizeSqft ?? null,
          rentAmount: BigInt(dto.rentAmount),
          unitTypeId: dto.unitTypeId ?? null,
          categoryId: dto.categoryId ?? null,
          featureIds: [...new Set(dto.featureIds ?? [])],
          description: optionalText(dto.description) ?? null,
        },
        include: INCLUDE,
      });
      await this.audit.record(
        { action: 'unit.create', entity: 'unit', entityId: created.id, after: snapshot(created) },
        tx,
      );
      return created;
    });
    return (await this.toUnits([row]))[0]!;
  }

  /** All or nothing: any clash with an existing number → 409 listing every clash. */
  async bulkCreate(dto: BulkCreateUnitsDto) {
    const { orgId } = orgContext();
    await this.properties.find(dto.propertyId);
    await this.checkRefs(dto);
    const numbers = cleanUnitNumbers(dto.numbers);
    const created = await this.write(async (tx) => {
      const clashes = await tx.unit.findMany({
        where: { propertyId: dto.propertyId, number: { in: numbers } },
        select: { number: true },
      });
      if (clashes.length) {
        const taken = new Set(clashes.map((c) => c.number));
        throw numberTaken(numbers.filter((n) => taken.has(n))); // in the order given
      }
      const { count } = await tx.unit.createMany({
        data: numbers.map((number) => ({
          orgId,
          propertyId: dto.propertyId,
          number,
          floor: dto.floor ?? 0,
          rentAmount: BigInt(dto.rentAmount),
          unitTypeId: dto.unitTypeId ?? null,
          categoryId: dto.categoryId ?? null,
          featureIds: [...new Set(dto.featureIds ?? [])],
        })),
      });
      await this.audit.record(
        {
          action: 'unit.bulk_create',
          entity: 'property',
          entityId: dto.propertyId,
          after: { numbers, rentAmount: dto.rentAmount, floor: dto.floor ?? 0 },
        },
        tx,
      );
      return count;
    });
    return { created };
  }

  async update(id: string, dto: UpdateUnitDto) {
    const before = await this.find(id);
    await this.checkRefs(dto);
    const row = await this.write(async (tx) => {
      if (dto.status === 'INACTIVE') {
        // Same lock as move-in, so a unit can't be let and withdrawn at the same moment.
        await lockUnit(tx, id);
        const current = await tx.tenancy.count({
          where: { unitId: id, status: { in: [...CURRENT] } },
        });
        if (current) {
          throw AppError.conflict(
            'Someone lives here. Move them out before marking the unit unavailable.',
            'UNIT_OCCUPIED',
          );
        }
      }
      const updated = await tx.unit.update({
        where: { id },
        data: {
          ...(dto.number !== undefined ? { number: dto.number.trim() } : {}),
          ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
          ...(dto.sizeSqft !== undefined ? { sizeSqft: dto.sizeSqft } : {}),
          ...(dto.rentAmount !== undefined ? { rentAmount: BigInt(dto.rentAmount) } : {}),
          ...(dto.unitTypeId !== undefined ? { unitTypeId: dto.unitTypeId } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.featureIds !== undefined ? { featureIds: [...new Set(dto.featureIds)] } : {}),
          ...(dto.description !== undefined ? { description: optionalText(dto.description) } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          action: 'unit.update',
          entity: 'unit',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
        tx,
      );
      return updated;
    });
    return (await this.toUnits([row]))[0]!;
  }

  async remove(id: string) {
    const u = await this.find(id);
    if (await this.db.tenancy.count({ where: { unitId: id } })) {
      throw AppError.conflict(
        'This unit has tenancy history and cannot be deleted. Mark it unavailable instead.',
        'UNIT_HAS_HISTORY',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.unit.delete({ where: { id } });
      await this.audit.record(
        { action: 'unit.delete', entity: 'unit', entityId: id, before: snapshot(u) },
        tx,
      );
    });
  }

  importTemplate(): string {
    return toCsv(
      [
        'propertyCode',
        'number',
        'floor',
        'sizeSqft',
        'rentAmount',
        'unitType',
        'category',
        'description',
      ],
      [['P0001', 'A1', 0, 650, 25000, '2 Bedroom', 'Residential', 'Corner unit with balcony']],
    );
  }

  async importCsv(dto: ImportUnitsCsvDto) {
    const { orgId } = orgContext();
    const dryRun = Boolean(dto.dryRun);
    const { rows } = parseCsv(dto.csv);
    if (rows.length === 0) {
      return {
        dryRun,
        created: 0,
        validCount: 0,
        totalRows: 0,
        rows: [],
        errors: [{ rowNumber: 1, field: 'csv', message: 'CSV has no data rows' }],
      };
    }
    if (rows.length > MAX_BULK_UNITS) {
      return {
        dryRun,
        created: 0,
        validCount: 0,
        totalRows: rows.length,
        rows: [],
        errors: [
          {
            rowNumber: 1,
            field: 'csv',
            message: `At most ${MAX_BULK_UNITS} units can be imported at once`,
          },
        ],
      };
    }

    const [props, types, categories] = await Promise.all([
      this.db.property.findMany({
        where: propertyScope(),
        select: { id: true, code: true, name: true },
      }),
      this.db.unitType.findMany({ select: { id: true, name: true } }),
      this.db.unitCategory.findMany({ select: { id: true, name: true } }),
    ]);

    const propByKey = new Map<string, { id: string; code: string; name: string }>();
    for (const p of props) {
      propByKey.set(p.code.toLowerCase(), p);
      propByKey.set(p.name.toLowerCase(), p);
    }
    const typeByName = new Map(types.map((t) => [t.name.toLowerCase(), t]));
    const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

    const existingUnits = props.length
      ? await this.db.unit.findMany({
          where: { propertyId: { in: props.map((p) => p.id) } },
          select: { propertyId: true, number: true },
        })
      : [];
    const existingSet = new Set(
      existingUnits.map((u) => `${u.propertyId}:${u.number.toLowerCase()}`),
    );
    const seenInCsv = new Set<string>();

    const errors: { rowNumber: number; field: string; message: string }[] = [];
    const validToInsert: {
      orgId: string;
      propertyId: string;
      number: string;
      floor: number;
      sizeSqft: number | null;
      rentAmount: bigint;
      unitTypeId: string | null;
      categoryId: string | null;
      description: string | null;
    }[] = [];
    const previewRows: {
      rowNumber: number;
      propertyCode: string;
      propertyName: string | null;
      number: string;
      floor: number;
      sizeSqft: number | null;
      rentAmount: bigint;
      unitType: string | null;
      category: string | null;
      valid: boolean;
    }[] = [];

    for (const r of rows) {
      const rowErrors: { rowNumber: number; field: string; message: string }[] = [];
      const rawProp = (r.values.propertycode || r.values.property || '').trim();
      const prop = rawProp ? propByKey.get(rawProp.toLowerCase()) : undefined;
      if (!prop) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'propertyCode',
          message: rawProp ? `Unknown property "${rawProp}"` : 'Property code is required',
        });
      }

      const number = (r.values.number || r.values.unit || r.values.unitnumber || '').trim();
      if (!number || !UNIT_NUMBER.test(number)) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'number',
          message: 'Unit number must be 1–20 letters, digits, spaces or . / -',
        });
      } else if (prop) {
        const key = `${prop.id}:${number.toLowerCase()}`;
        if (seenInCsv.has(key)) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'number',
            message: `Unit ${number} is listed more than once for ${prop.code}`,
          });
        } else if (existingSet.has(key)) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'number',
            message: `Unit ${number} already exists in ${prop.code}`,
          });
        }
        seenInCsv.add(key);
      }

      const rawFloor = (r.values.floor || '').trim();
      let floor = 0;
      if (rawFloor) {
        const parsedFloor = Number(rawFloor);
        if (!Number.isInteger(parsedFloor) || parsedFloor < -5 || parsedFloor > 200) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'floor',
            message: 'Floor must be an integer between -5 and 200',
          });
        } else {
          floor = parsedFloor;
        }
      }

      const rawSize = (r.values.sizesqft || r.values.size || '').trim();
      let sizeSqft: number | null = null;
      if (rawSize) {
        const parsedSize = Number(rawSize.replace(/,/g, ''));
        if (!Number.isInteger(parsedSize) || parsedSize < 1 || parsedSize > 1_000_000) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'sizeSqft',
            message: 'sizeSqft must be a positive integer',
          });
        } else {
          sizeSqft = parsedSize;
        }
      }

      const rawRent = (r.values.rentamount || r.values.rent || r.values.rentkes || '').trim();
      const parsedRent = Number(rawRent.replace(/,/g, ''));
      let rentAmount = 0n;
      if (!rawRent || !Number.isFinite(parsedRent) || parsedRent < 0 || parsedRent > 100_000_000) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'rentAmount',
          message: 'Enter a valid monthly rent in KES (e.g. 25000)',
        });
      } else {
        rentAmount = BigInt(Math.round(parsedRent * 100));
      }

      const rawType = (r.values.unittype || r.values.type || '').trim();
      let unitTypeId: string | null = null;
      let unitTypeName: string | null = null;
      if (rawType) {
        const matchedType = typeByName.get(rawType.toLowerCase());
        if (!matchedType) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'unitType',
            message: `Unknown unit type "${rawType}"`,
          });
        } else {
          unitTypeId = matchedType.id;
          unitTypeName = matchedType.name;
        }
      }

      const rawCat = (r.values.category || r.values.unitcategory || '').trim();
      let categoryId: string | null = null;
      let categoryName: string | null = null;
      if (rawCat) {
        const matchedCat = catByName.get(rawCat.toLowerCase());
        if (!matchedCat) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'category',
            message: `Unknown unit category "${rawCat}"`,
          });
        } else {
          categoryId = matchedCat.id;
          categoryName = matchedCat.name;
        }
      }

      const description = optionalText(r.values.description)?.slice(0, 500) ?? null;

      errors.push(...rowErrors);
      const valid = rowErrors.length === 0;
      previewRows.push({
        rowNumber: r.rowNumber,
        propertyCode: prop?.code ?? rawProp,
        propertyName: prop?.name ?? null,
        number,
        floor,
        sizeSqft,
        rentAmount,
        unitType: unitTypeName ?? (rawType || null),
        category: categoryName ?? (rawCat || null),
        valid,
      });

      if (valid && prop) {
        validToInsert.push({
          orgId,
          propertyId: prop.id,
          number,
          floor,
          sizeSqft,
          rentAmount,
          unitTypeId,
          categoryId,
          description,
        });
      }
    }

    if (dryRun || errors.length > 0) {
      return {
        dryRun,
        created: 0,
        validCount: validToInsert.length,
        totalRows: rows.length,
        rows: previewRows,
        errors,
      };
    }

    const created = await this.write(async (tx) => {
      const { count } = await tx.unit.createMany({
        data: validToInsert.map((u) => ({
          ...u,
          featureIds: [],
        })),
      });
      await this.audit.record(
        {
          action: 'unit.import_csv',
          entity: 'unit',
          entityId: orgId,
          after: { count, units: validToInsert.map((u) => u.number) },
        },
        tx,
      );
      return count;
    });

    return {
      dryRun: false,
      created,
      validCount: validToInsert.length,
      totalRows: rows.length,
      rows: previewRows,
      errors: [],
    };
  }

  /** A unit the caller may see, or 404. */
  async find(id: string): Promise<UnitRow> {
    const u = await this.db.unit.findFirst({
      where: { AND: [{ id }, unitScope()] },
      include: INCLUDE,
    });
    if (!u) throw AppError.notFound('Unit');
    return u;
  }

  private async checkRefs(dto: {
    unitTypeId?: string | null;
    categoryId?: string | null;
    featureIds?: string[];
  }) {
    const details: ErrorDetail[] = [];
    if (dto.unitTypeId && (await this.catalog.missing('unitType', [dto.unitTypeId])).length) {
      details.push({ field: 'unitTypeId', message: 'Choose a unit type from the list' });
    }
    if (dto.categoryId && (await this.catalog.missing('unitCategory', [dto.categoryId])).length) {
      details.push({ field: 'categoryId', message: 'Choose a category from the list' });
    }
    if (
      dto.featureIds?.length &&
      (await this.catalog.missing('unitFeature', dto.featureIds)).length
    ) {
      details.push({ field: 'featureIds', message: 'Some features no longer exist' });
    }
    if (details.length) throw AppError.validation(details);
  }

  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(fn);
    } catch (e) {
      if (violatesUnique(e, 'number')) throw numberTaken([]);
      throw e;
    }
  }
}

/** Row lock on a unit for the rest of the transaction (move-in vs. withdrawing the unit). */
export async function lockUnit(tx: Tx, unitId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "units" WHERE "id" = ${unitId}::uuid FOR UPDATE`;
}

function numberTaken(numbers: string[]): AppError {
  return new AppError(
    409,
    'NUMBER_TAKEN',
    numbers.length
      ? `This property already has ${numbers.length === 1 ? 'unit' : 'units'} ${numbers.join(', ')}`
      : 'This property already has a unit with that number',
    numbers.map((n) => ({ field: 'numbers', message: `${n} already exists` })),
  );
}
