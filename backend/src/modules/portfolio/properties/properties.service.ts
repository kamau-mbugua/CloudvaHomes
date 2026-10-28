import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { isAgency, optionalText } from '../fields.js';
import { propertyScope, requireAllProperties } from '../property-scope.js';
import type {
  CreatePropertyDto,
  ListPropertiesQueryDto,
  UpdatePropertyDto,
} from './properties.dto.js';

const INCLUDE = {
  landlord: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PropertyInclude;

type PropertyRow = Prisma.PropertyGetPayload<{ include: typeof INCLUDE }>;

export interface Occupancy {
  unitCount: number;
  occupiedCount: number;
  noticeCount: number;
  vacantCount: number;
}

const NO_UNITS: Occupancy = { unitCount: 0, occupiedCount: 0, noticeCount: 0, vacantCount: 0 };

function snapshot(p: PropertyRow) {
  return {
    name: p.name,
    code: p.code,
    location: p.location,
    county: p.county,
    floors: p.floors,
    landlordId: p.landlordId,
    status: p.status,
  };
}

function toProperty(p: PropertyRow, occ: Occupancy = NO_UNITS) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    location: p.location,
    county: p.county,
    floors: p.floors,
    status: p.status,
    landlord: p.landlord,
    ...occ,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class PropertiesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListPropertiesQueryDto) {
    const term = q.q?.trim();
    const where: Prisma.PropertyWhereInput = {
      AND: [
        propertyScope(),
        q.status ? { status: q.status } : {},
        q.landlordId ? { landlordId: q.landlordId } : {},
        term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { code: { contains: term, mode: 'insensitive' } },
                { location: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.property.findMany({
        where,
        include: INCLUDE,
        orderBy: { name: 'asc' },
        ...toSkipTake(q),
      }),
      this.db.property.count({ where }),
    ]);
    const occ = await this.occupancy(rows.map((r) => r.id));
    return paginated(
      rows.map((r) => toProperty(r, occ.get(r.id))),
      total,
      q,
    );
  }

  async get(id: string) {
    const p = await this.find(id);
    return toProperty(p, (await this.occupancy([id])).get(id));
  }

  async create(dto: CreatePropertyDto) {
    requireAllProperties();
    const { orgId } = orgContext();
    const landlordId = await this.checkLandlord(dto.landlordId, true);
    const row = await this.write(async (tx) => {
      const created = await tx.property.create({
        data: {
          orgId,
          name: dto.name.trim(),
          code: dto.code.toUpperCase(),
          location: optionalText(dto.location) ?? null,
          county: optionalText(dto.county) ?? null,
          floors: dto.floors ?? 1,
          landlordId,
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          action: 'property.create',
          entity: 'property',
          entityId: created.id,
          after: snapshot(created),
        },
        tx,
      );
      return created;
    });
    return toProperty(row);
  }

  async update(id: string, dto: UpdatePropertyDto) {
    const before = await this.find(id);
    const landlordId =
      dto.landlordId !== undefined ? await this.checkLandlord(dto.landlordId, false) : undefined;
    const row = await this.write(async (tx) => {
      const updated = await tx.property.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined ? { code: dto.code.toUpperCase() } : {}),
          ...(dto.location !== undefined ? { location: optionalText(dto.location) } : {}),
          ...(dto.county !== undefined ? { county: optionalText(dto.county) } : {}),
          ...(dto.floors !== undefined ? { floors: dto.floors } : {}),
          ...(landlordId !== undefined ? { landlordId } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          action: 'property.update',
          entity: 'property',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
        tx,
      );
      return updated;
    });
    return toProperty(row, (await this.occupancy([id])).get(id));
  }

  async remove(id: string) {
    const p = await this.find(id);
    if (await this.db.unit.count({ where: { propertyId: id } })) {
      throw AppError.conflict(
        'This property has units. Delete them first, or mark the property inactive.',
        'PROPERTY_HAS_UNITS',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.property.delete({ where: { id } });
      await this.audit.record(
        { action: 'property.delete', entity: 'property', entityId: id, before: snapshot(p) },
        tx,
      );
    });
  }

  /** A property the caller may see, or 404. Used by units and tenancies too. */
  async find(id: string): Promise<PropertyRow> {
    const p = await this.db.property.findFirst({
      where: { AND: [{ id }, propertyScope()] },
      include: INCLUDE,
    });
    if (!p) throw AppError.notFound('Property');
    return p;
  }

  /** Unit counts per property in one query. Vacant = active units with no current tenancy. */
  async occupancy(propertyIds: string[]): Promise<Map<string, Occupancy>> {
    if (!propertyIds.length) return new Map();
    // Raw SQL is not org-scoped by the extension: filter by orgId explicitly.
    const rows = await this.db.$queryRaw<
      { id: string; total: number; occupied: number; notice: number; vacant: number }[]
    >`
      SELECT u."propertyId" AS id,
             count(*)::int AS total,
             count(*) FILTER (WHERE t."status" = 'ACTIVE')::int AS occupied,
             count(*) FILTER (WHERE t."status" = 'NOTICE')::int AS notice,
             count(*) FILTER (WHERE t."id" IS NULL AND u."status" = 'ACTIVE')::int AS vacant
        FROM "units" u
        LEFT JOIN "tenancies" t ON t."unitId" = u."id" AND t."status" IN ('ACTIVE', 'NOTICE')
       WHERE u."orgId" = ${orgContext().orgId}::uuid
         AND u."propertyId" = ANY(${propertyIds}::uuid[])
       GROUP BY u."propertyId"`;
    return new Map(
      rows.map((r) => [
        r.id,
        {
          unitCount: r.total,
          occupiedCount: r.occupied,
          noticeCount: r.notice,
          vacantCount: r.vacant,
        },
      ]),
    );
  }

  /**
   * Agencies must name a landlord (when `required`); landlord organisations must not.
   * Returns the id to store.
   */
  private async checkLandlord(landlordId: string | undefined, required: boolean) {
    if (!(await isAgency(this.db))) {
      if (landlordId) {
        throw AppError.fieldInvalid('landlordId', 'Only agencies assign properties to landlords');
      }
      return null;
    }
    if (!landlordId) {
      if (required) throw AppError.fieldInvalid('landlordId', 'Choose the landlord');
      return null;
    }
    const exists = await this.db.landlord.count({ where: { id: landlordId } });
    if (!exists) throw AppError.fieldInvalid('landlordId', 'Choose the landlord');
    return landlordId;
  }

  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(fn);
    } catch (e) {
      if (violatesUnique(e, 'code')) {
        throw AppError.conflict('Another property already uses this code', 'CODE_TAKEN');
      }
      throw e;
    }
  }
}
