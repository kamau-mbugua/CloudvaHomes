import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { optionalText } from '../fields.js';
import type { CreateCatalogItemDto, UpdateCatalogItemDto } from './catalog.dto.js';

/** The three organisation-wide lists units are described with. Same shape, same rules. */
export type CatalogKind = 'unitType' | 'unitCategory' | 'unitFeature';

const LABEL: Record<CatalogKind, { noun: string; entity: string }> = {
  unitType: { noun: 'Unit type', entity: 'unit_type' },
  unitCategory: { noun: 'Unit category', entity: 'unit_category' },
  unitFeature: { noun: 'Feature', entity: 'unit_feature' },
};

interface CatalogRow {
  id: string;
  name: string;
  description: string | null;
}

/** The slice of the three Prisma delegates used here (they are structurally identical). */
interface CatalogDelegate {
  findMany(args: object): Promise<CatalogRow[]>;
  findUnique(args: object): Promise<CatalogRow | null>;
  create(args: object): Promise<CatalogRow>;
  update(args: object): Promise<CatalogRow>;
  delete(args: object): Promise<CatalogRow>;
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  private delegate(client: Db | Tx, kind: CatalogKind): CatalogDelegate {
    return client[kind] as unknown as CatalogDelegate;
  }

  async list(kind: CatalogKind) {
    const rows = await this.delegate(this.db, kind).findMany({ orderBy: { name: 'asc' } });
    const counts = await this.unitCounts(kind);
    return rows.map((r) => ({ ...pick(r), unitCount: counts.get(r.id) ?? 0 }));
  }

  async create(kind: CatalogKind, dto: CreateCatalogItemDto) {
    const { orgId } = orgContext();
    return this.write(kind, async (tx) => {
      const row = await this.delegate(tx, kind).create({
        data: { orgId, name: dto.name.trim(), description: optionalText(dto.description) ?? null },
      });
      await this.audit.record(
        {
          action: `${LABEL[kind].entity}.create`,
          entity: LABEL[kind].entity,
          entityId: row.id,
          after: pick(row),
        },
        tx,
      );
      return { ...pick(row), unitCount: 0 };
    });
  }

  async update(kind: CatalogKind, id: string, dto: UpdateCatalogItemDto) {
    const before = await this.find(kind, id);
    return this.write(kind, async (tx) => {
      const row = await this.delegate(tx, kind).update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: optionalText(dto.description) } : {}),
        },
      });
      await this.audit.record(
        {
          action: `${LABEL[kind].entity}.update`,
          entity: LABEL[kind].entity,
          entityId: id,
          before: pick(before),
          after: pick(row),
        },
        tx,
      );
      return { ...pick(row), unitCount: (await this.unitCounts(kind)).get(id) ?? 0 };
    });
  }

  async remove(kind: CatalogKind, id: string) {
    const before = await this.find(kind, id);
    if ((await this.unitCounts(kind)).get(id)) {
      throw AppError.conflict(
        `${LABEL[kind].noun} is used by some units. Change those units first.`,
        'IN_USE',
      );
    }
    await this.db.$transaction(async (tx) => {
      await this.delegate(tx, kind).delete({ where: { id } });
      await this.audit.record(
        {
          action: `${LABEL[kind].entity}.delete`,
          entity: LABEL[kind].entity,
          entityId: id,
          before: pick(before),
        },
        tx,
      );
    });
  }

  /** Ids that don't exist in this organisation, for validating a unit's references. */
  async missing(kind: CatalogKind, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const found = await this.delegate(this.db, kind).findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const have = new Set(found.map((r) => r.id));
    return ids.filter((id) => !have.has(id));
  }

  private async find(kind: CatalogKind, id: string) {
    const row = await this.delegate(this.db, kind).findUnique({ where: { id } });
    if (!row) throw AppError.notFound(LABEL[kind].noun);
    return row;
  }

  /** Units using each item (all units, whatever property — the lists are organisation-wide). */
  private async unitCounts(kind: CatalogKind): Promise<Map<string, number>> {
    if (kind === 'unitFeature') {
      const rows = await this.db.$queryRaw<{ id: string; n: number }[]>`
        SELECT f AS id, count(*)::int AS n
          FROM "units", unnest("featureIds") AS f
         WHERE "orgId" = ${orgContext().orgId}::uuid
         GROUP BY f`;
      return new Map(rows.map((r) => [r.id, r.n]));
    }
    const by = kind === 'unitType' ? 'unitTypeId' : 'categoryId';
    const rows = await this.db.unit.groupBy({ by: [by], _count: { _all: true } });
    return new Map(
      rows.flatMap((r) => {
        const id = r[by];
        return id ? [[id, r._count._all] as const] : [];
      }),
    );
  }

  private async write<T>(kind: CatalogKind, fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(fn);
    } catch (e) {
      if (violatesUnique(e, 'name')) {
        throw AppError.conflict(`${LABEL[kind].noun} with that name already exists`, 'NAME_TAKEN');
      }
      throw e;
    }
  }
}

function pick(r: CatalogRow) {
  return { id: r.id, name: r.name, description: r.description };
}
