import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import type { Landlord, Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { nextCode } from '../codes.js';
import { optionalEmail, requireAgency, requiredPhone, upper } from '../fields.js';
import { IdNumbers } from '../id-numbers.js';
import { landlordScope } from '../property-scope.js';
import type {
  CreateLandlordDto,
  ListLandlordsQueryDto,
  UpdateLandlordDto,
} from './landlords.dto.js';

type LandlordRow = Landlord & { _count: { properties: number } };

const WITH_COUNT = { _count: { select: { properties: true } } } as const;

/** Audit snapshot: everything except the ciphertext (the hint shows whether an ID is set). */
function snapshot(l: Landlord) {
  return {
    code: l.code,
    name: l.name,
    kind: l.kind,
    phone: l.phone,
    email: l.email,
    kraPin: l.kraPin,
    idNumberHint: l.idNumberHint,
    status: l.status,
  };
}

/** Clients of an agency (design §5.3). Every endpoint answers 403 AGENCY_ONLY for landlords. */
@Injectable()
export class LandlordsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly ids: IdNumbers,
  ) {}

  private toLandlord(l: LandlordRow) {
    return {
      id: l.id,
      code: l.code,
      name: l.name,
      kind: l.kind,
      phone: l.phone,
      email: l.email,
      kraPin: l.kraPin,
      idNumberMasked: this.ids.masked(l.idNumberHint),
      status: l.status,
      propertyCount: l._count.properties,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }

  async list(q: ListLandlordsQueryDto) {
    await requireAgency(this.db);
    const term = q.q?.trim();
    const where: Prisma.LandlordWhereInput = {
      AND: [
        landlordScope(),
        q.status ? { status: q.status } : {},
        term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { code: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term.replace(/\s/g, '') } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.landlord.findMany({
        where,
        include: WITH_COUNT,
        orderBy: { name: 'asc' },
        ...toSkipTake(q),
      }),
      this.db.landlord.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.toLandlord(r)),
      total,
      q,
    );
  }

  async get(id: string) {
    await requireAgency(this.db);
    return this.toLandlord(await this.find(id));
  }

  async revealIdNumber(id: string) {
    await requireAgency(this.db);
    const { orgId } = orgContext();
    const l = await this.find(id);
    await this.audit.record({ action: 'landlord.reveal_id', entity: 'landlord', entityId: id });
    return { idNumber: this.ids.reveal(l.idNumberEnc, orgId, 'landlord') };
  }

  async create(dto: CreateLandlordDto) {
    await requireAgency(this.db);
    const { orgId } = orgContext();
    const idNumber = this.ids.normalize(dto.idNumber);
    const data = {
      name: dto.name.trim(),
      kind: dto.kind,
      phone: requiredPhone('phone', dto.phone),
      email: optionalEmail('email', dto.email) ?? null,
      kraPin: upper(dto.kraPin) ?? null,
      ...this.ids.seal(idNumber, orgId, 'landlord'),
    };
    const row = await this.write(async (tx) => {
      const created = await tx.landlord.create({
        data: { ...data, orgId, code: await nextCode(tx, orgId, 'landlord', 'L', 4) },
        include: WITH_COUNT,
      });
      await this.audit.record(
        {
          action: 'landlord.create',
          entity: 'landlord',
          entityId: created.id,
          after: snapshot(created),
        },
        tx,
      );
      return created;
    });
    return this.toLandlord(row);
  }

  async update(id: string, dto: UpdateLandlordDto) {
    await requireAgency(this.db);
    const { orgId } = orgContext();
    const before = await this.find(id);
    const data: Prisma.LandlordUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.phone !== undefined ? { phone: requiredPhone('phone', dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: optionalEmail('email', dto.email) } : {}),
      ...(dto.kraPin !== undefined ? { kraPin: upper(dto.kraPin) } : {}),
      ...(dto.idNumber !== undefined
        ? this.ids.seal(this.ids.normalize(dto.idNumber), orgId, 'landlord')
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    const row = await this.write(async (tx) => {
      const updated = await tx.landlord.update({ where: { id }, data, include: WITH_COUNT });
      await this.audit.record(
        {
          action: 'landlord.update',
          entity: 'landlord',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
        tx,
      );
      return updated;
    });
    return this.toLandlord(row);
  }

  async remove(id: string) {
    await requireAgency(this.db);
    const l = await this.find(id);
    if (l._count.properties > 0) {
      throw AppError.conflict(
        'This landlord still has properties. Move or delete them first, or mark the landlord inactive.',
        'LANDLORD_HAS_PROPERTIES',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.landlord.delete({ where: { id } });
      await this.audit.record(
        { action: 'landlord.delete', entity: 'landlord', entityId: id, before: snapshot(l) },
        tx,
      );
    });
  }

  private async find(id: string): Promise<LandlordRow> {
    const l = await this.db.landlord.findFirst({
      where: { AND: [{ id }, landlordScope()] },
      include: WITH_COUNT,
    });
    if (!l) throw AppError.notFound('Landlord');
    return l;
  }

  /** Runs a write; a duplicate ID number (blind index) becomes 409 ID_NUMBER_TAKEN. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(fn);
    } catch (e) {
      if (violatesUnique(e, 'idNumberIndex')) {
        throw AppError.conflict('Another landlord has this ID number', 'ID_NUMBER_TAKEN');
      }
      throw e;
    }
  }
}
