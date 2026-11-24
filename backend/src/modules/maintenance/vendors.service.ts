import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Prisma, Vendor } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizeEmail, normalizePhone } from '../auth/identifiers.js';
import { orgContext } from '../auth/decorators.js';
import type { CreateVendorDto, ListVendorsQueryDto, UpdateVendorDto } from './maintenance.dto.js';

export function toVendor(v: Vendor & { _count?: { jobs: number } }) {
  return {
    id: v.id,
    name: v.name,
    phone: v.phone,
    email: v.email,
    trades: v.trades,
    notes: v.notes,
    active: v.active,
    openJobs: v._count?.jobs,
    createdAt: v.createdAt,
  };
}

/** The organisation's vendors (phase 18, first step): who maintenance jobs can be sent to. */
@Injectable()
export class VendorsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListVendorsQueryDto) {
    const term = q.q?.trim();
    const where: Prisma.VendorWhereInput = {
      ...(q.active === 'all' ? {} : { active: q.active !== 'false' }),
      ...(q.trade ? { trades: { has: q.trade } } : {}),
      ...(term
        ? {
            OR: [{ name: { contains: term, mode: 'insensitive' } }, { phone: { contains: term } }],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.vendor.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { jobs: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } } },
        },
        ...toSkipTake(q),
      }),
      this.db.vendor.count({ where }),
    ]);
    return paginated(rows.map(toVendor), total, q);
  }

  async create(dto: CreateVendorDto) {
    const { orgId } = orgContext();
    const data = this.fields(dto);
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.vendor.create({
          data: {
            orgId,
            name: data.name!,
            phone: data.phone!,
            email: data.email ?? null,
            trades: data.trades ?? [],
            notes: data.notes ?? null,
          },
        });
        await this.audit.record(
          { action: 'vendor.create', entity: 'vendor', entityId: row.id, after: toVendor(row) },
          tx,
        );
        return toVendor(row);
      });
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async update(id: string, dto: UpdateVendorDto) {
    const before = await this.find(id);
    const data = this.fields(dto);
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.vendor.update({
          where: { id },
          data: { ...data, ...(dto.active !== undefined ? { active: dto.active } : {}) },
        });
        await this.audit.record(
          {
            action: 'vendor.update',
            entity: 'vendor',
            entityId: id,
            before: toVendor(before),
            after: toVendor(row),
          },
          tx,
        );
        return toVendor(row);
      });
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async find(id: string): Promise<Vendor> {
    const v = await this.db.vendor.findFirst({ where: { id } });
    if (!v) throw AppError.notFound('Vendor');
    return v;
  }

  private fields(dto: Partial<CreateVendorDto>) {
    const out: Partial<Pick<Vendor, 'name' | 'phone' | 'email' | 'trades' | 'notes'>> = {};
    if (dto.name !== undefined) out.name = dto.name.trim();
    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!phone)
        throw AppError.fieldInvalid('phone', 'Enter a valid phone number, e.g. 0712 345 678');
      out.phone = phone;
    }
    if (dto.email !== undefined) {
      const raw = dto.email?.trim() ?? '';
      out.email = raw ? normalizeEmail(raw) : null;
      if (raw && !out.email) throw AppError.fieldInvalid('email', 'Enter a valid email address');
    }
    if (dto.trades !== undefined) out.trades = [...new Set(dto.trades)];
    if (dto.notes !== undefined) out.notes = dto.notes?.trim() || null;
    return out;
  }

  private conflict(e: unknown) {
    return violatesUnique(e, 'phone')
      ? AppError.fieldInvalid('phone', 'You already have a vendor with this phone number')
      : e;
  }
}
