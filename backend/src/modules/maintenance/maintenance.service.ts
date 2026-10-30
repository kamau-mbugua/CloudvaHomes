import { Inject, Injectable } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { formatDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { type PaginationQueryDto, pageMeta, toSkipTake } from '../../common/http/pagination.js';
import type { MaintenanceRequest, Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { UploadsService } from '../files/uploads.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { nextCode } from '../portfolio/codes.js';
import { optionalText } from '../portfolio/fields.js';
import { propertyScope } from '../portfolio/property-scope.js';
import type {
  ConvertMaintenanceToExpenseDto,
  CreateMaintenanceRequestDto,
  CreateTenantMaintenanceRequestDto,
  ListMaintenanceQueryDto,
  UpdateMaintenanceRequestDto,
} from './maintenance.dto.js';

const INCLUDE = {
  property: { select: { id: true, code: true, name: true } },
  unit: { select: { id: true, number: true, floor: true } },
  tenant: {
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      userId: true,
    },
  },
  expense: {
    select: {
      id: true,
      name: true,
      amount: true,
      incurredOn: true,
      voidedAt: true,
    },
  },
} as const;

type MaintenanceRow = MaintenanceRequest & {
  property: { id: string; code: string; name: string };
  unit: { id: string; number: string; floor: number };
  tenant: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    userId: string | null;
  } | null;
  expense: {
    id: string;
    name: string;
    amount: bigint;
    incurredOn: Date;
    voidedAt: Date | null;
  } | null;
};

function snapshot(m: MaintenanceRequest) {
  return {
    number: m.number,
    propertyId: m.propertyId,
    unitId: m.unitId,
    tenancyId: m.tenancyId,
    tenantId: m.tenantId,
    category: m.category,
    priority: m.priority,
    status: m.status,
    title: m.title,
    description: m.description,
    photoUploadIds: m.photoUploadIds,
    resolutionNote: m.resolutionNote,
    expenseId: m.expenseId,
  };
}

@Injectable()
export class MaintenanceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly expenses: ExpensesService,
    private readonly notifications: NotificationsService,
  ) {}

  private view(rows: MaintenanceRow[]) {
    const perms = currentContext()?.permissions ?? new Set<string>();
    const canUpdate = perms.has('maintenance:update');
    const canCreateExpense = perms.has('expenses:create');

    return rows.map((r) => {
      const activeExpense = r.expense && !r.expense.voidedAt ? r.expense : null;
      const isTerminal = r.status === 'RESOLVED' || r.status === 'CANCELLED';
      return {
        id: r.id,
        number: r.number,
        code: r.number,
        category: r.category,
        priority: r.priority,
        status: r.status,
        title: r.title,
        description: r.description,
        photoUploadIds: r.photoUploadIds,
        resolutionNote: r.resolutionNote,
        resolvedById: r.resolvedById,
        resolvedAt: r.resolvedAt,
        createdById: r.createdById,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        property: r.property,
        unit: r.unit,
        tenant: r.tenant
          ? {
              id: r.tenant.id,
              code: r.tenant.code,
              name: `${r.tenant.firstName} ${r.tenant.lastName}`,
              firstName: r.tenant.firstName,
              lastName: r.tenant.lastName,
              phone: r.tenant.phone,
              email: r.tenant.email,
            }
          : null,
        expense: activeExpense
          ? {
              id: activeExpense.id,
              name: activeExpense.name,
              amount: activeExpense.amount,
              incurredOn: formatDateOnly(activeExpense.incurredOn),
            }
          : null,
        canResolve: canUpdate && !isTerminal,
        canCancel: canUpdate && !isTerminal,
        canConvertToExpense: canCreateExpense && !activeExpense && r.status !== 'CANCELLED',
      };
    });
  }

  private where(q: ListMaintenanceQueryDto): Prisma.MaintenanceRequestWhereInput {
    const term = q.q?.trim();
    return {
      AND: [
        { property: propertyScope() },
        q.propertyId ? { propertyId: q.propertyId } : {},
        q.unitId ? { unitId: q.unitId } : {},
        q.tenantId ? { tenantId: q.tenantId } : {},
        q.status ? { status: q.status } : {},
        q.priority ? { priority: q.priority } : {},
        q.category ? { category: q.category } : {},
        term
          ? {
              OR: [
                { number: { contains: term, mode: 'insensitive' } },
                { title: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
                { unit: { number: { contains: term, mode: 'insensitive' } } },
                { tenant: { firstName: { contains: term, mode: 'insensitive' } } },
                { tenant: { lastName: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
  }

  async list(q: ListMaintenanceQueryDto) {
    const where = this.where(q);
    const scopeWhere: Prisma.MaintenanceRequestWhereInput = {
      property: propertyScope(),
      ...(q.propertyId ? { propertyId: q.propertyId } : {}),
    };
    const [rows, total, open, inProgress, resolved, urgentOpen] = await Promise.all([
      this.db.maintenanceRequest.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.maintenanceRequest.count({ where }),
      this.db.maintenanceRequest.count({ where: { ...scopeWhere, status: 'OPEN' } }),
      this.db.maintenanceRequest.count({ where: { ...scopeWhere, status: 'IN_PROGRESS' } }),
      this.db.maintenanceRequest.count({ where: { ...scopeWhere, status: 'RESOLVED' } }),
      this.db.maintenanceRequest.count({
        where: {
          ...scopeWhere,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          priority: 'URGENT',
        },
      }),
    ]);
    return {
      data: this.view(rows),
      meta: {
        ...pageMeta(total, q),
        counts: { open, inProgress, resolved, urgentOpen },
      },
    };
  }

  async get(id: string) {
    return this.view([await this.find(id)])[0]!;
  }

  async createForStaff(dto: CreateMaintenanceRequestDto) {
    const ctx = orgContext();
    const unit = await this.db.unit.findFirst({
      where: { id: dto.unitId, property: propertyScope() },
      include: {
        property: { select: { id: true, code: true, name: true } },
        tenancies: {
          where: { status: { in: ['ACTIVE', 'NOTICE'] } },
          orderBy: { startDate: 'desc' },
          take: 1,
          select: { id: true, tenantId: true },
        },
      },
    });
    if (!unit) throw AppError.notFound('Unit');

    const activeTenancy = unit.tenancies[0];
    let tenantId: string | null = dto.tenantId ?? activeTenancy?.tenantId ?? null;
    if (dto.tenantId) {
      const tenant = await this.db.tenant.findFirst({
        where: { id: dto.tenantId },
        select: { id: true },
      });
      if (!tenant) throw AppError.notFound('Tenant');
      tenantId = tenant.id;
    }

    const photoIds = [...new Set(dto.photoUploadIds ?? [])];
    const year = todayInNairobi().slice(0, 4);

    const row = await this.db.$transaction(async (tx) => {
      for (const uploadId of photoIds) {
        await this.uploads.attach(tx, uploadId, 'MAINTENANCE_PHOTO', 'photoUploadIds');
      }
      const number = await nextCode(tx, ctx.orgId, `maintenance:${year}`, `MNT-${year}-`, 6);
      const created = await tx.maintenanceRequest.create({
        data: {
          orgId: ctx.orgId,
          propertyId: unit.property.id,
          unitId: unit.id,
          tenancyId: activeTenancy?.id ?? null,
          tenantId,
          number,
          category: dto.category ?? 'OTHER',
          priority: dto.priority ?? 'MEDIUM',
          status: 'OPEN',
          title: dto.title.trim(),
          description: dto.description.trim(),
          photoUploadIds: photoIds,
          createdById: ctx.userId,
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          action: 'maintenance_request.create',
          entity: 'maintenance_request',
          entityId: created.id,
          after: snapshot(created),
        },
        tx,
      );
      return created;
    });

    if (row.tenant?.userId && row.tenant.userId !== ctx.userId) {
      await this.notifications.notifyUser({
        userId: row.tenant.userId,
        orgId: ctx.orgId,
        tenantId: row.tenant.id,
        kind: 'MAINTENANCE_CREATED',
        title: `Maintenance ticket ${row.number} opened`,
        body: `${row.title} (${row.property.name} · Unit ${row.unit.number})`,
        actionUrl: '/tenant',
      });
    }

    return this.view([row])[0]!;
  }

  async listForTenant(tenantId: string, q: PaginationQueryDto) {
    const where: Prisma.MaintenanceRequestWhereInput = { tenantId };
    const [rows, total] = await Promise.all([
      this.db.maintenanceRequest.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.maintenanceRequest.count({ where }),
    ]);
    return {
      data: this.view(rows),
      meta: pageMeta(total, q),
    };
  }

  async createForTenant(tenantId: string, dto: CreateTenantMaintenanceRequestDto) {
    const ctx = orgContext();
    const activeTenancies = await this.db.tenancy.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'NOTICE'] },
      },
      include: {
        unit: {
          include: {
            property: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!activeTenancies.length) {
      throw AppError.conflict(
        'You need an active unit tenancy to submit a maintenance request.',
        'NO_ACTIVE_TENANCY',
      );
    }

    const chosen = dto.unitId
      ? activeTenancies.find((t) => t.unitId === dto.unitId)
      : activeTenancies[0];
    if (!chosen) throw AppError.notFound('Unit');

    const photoIds = [...new Set(dto.photoUploadIds ?? [])];
    const year = todayInNairobi().slice(0, 4);

    const row = await this.db.$transaction(async (tx) => {
      for (const uploadId of photoIds) {
        await this.uploads.attach(tx, uploadId, 'MAINTENANCE_PHOTO', 'photoUploadIds');
      }
      const number = await nextCode(tx, ctx.orgId, `maintenance:${year}`, `MNT-${year}-`, 6);
      const created = await tx.maintenanceRequest.create({
        data: {
          orgId: ctx.orgId,
          propertyId: chosen.unit.property.id,
          unitId: chosen.unit.id,
          tenancyId: chosen.id,
          tenantId,
          number,
          category: dto.category ?? 'OTHER',
          priority: dto.priority ?? 'MEDIUM',
          status: 'OPEN',
          title: dto.title.trim(),
          description: dto.description.trim(),
          photoUploadIds: photoIds,
          createdById: ctx.userId,
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          action: 'maintenance_request.create_tenant',
          entity: 'maintenance_request',
          entityId: created.id,
          after: snapshot(created),
        },
        tx,
      );
      return created;
    });

    await this.notifications.notifyOrgStaff(ctx.orgId, {
      kind: 'MAINTENANCE_CREATED',
      title: `New maintenance request ${row.number}`,
      body: `${row.title} — ${row.property.name} Unit ${row.unit.number}`,
      actionUrl: '/maintenance',
      excludeUserId: ctx.userId,
    });

    return this.view([row])[0]!;
  }

  async update(id: string, dto: UpdateMaintenanceRequestDto) {
    const ctx = orgContext();
    const before = await this.find(id);
    const nextPhotoIds =
      dto.photoUploadIds !== undefined ? [...new Set(dto.photoUploadIds)] : undefined;
    const addedPhotos = nextPhotoIds
      ? nextPhotoIds.filter((x) => !before.photoUploadIds.includes(x))
      : [];

    const statusChangedToResolved = dto.status === 'RESOLVED' && before.status !== 'RESOLVED';

    const row = await this.db.$transaction(async (tx) => {
      for (const uploadId of addedPhotos) {
        await this.uploads.attach(tx, uploadId, 'MAINTENANCE_PHOTO', 'photoUploadIds');
      }
      const updated = await tx.maintenanceRequest.update({
        where: { id },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.resolutionNote !== undefined
            ? { resolutionNote: optionalText(dto.resolutionNote) ?? null }
            : {}),
          ...(nextPhotoIds !== undefined ? { photoUploadIds: nextPhotoIds } : {}),
          ...(statusChangedToResolved ? { resolvedById: ctx.userId, resolvedAt: new Date() } : {}),
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          action: 'maintenance_request.update',
          entity: 'maintenance_request',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
        tx,
      );
      return updated;
    });

    if (
      row.tenant?.userId &&
      (dto.status !== undefined || dto.resolutionNote !== undefined) &&
      (row.status !== before.status || row.resolutionNote !== before.resolutionNote)
    ) {
      const statusLabel = row.status.replace('_', ' ').toLowerCase();
      await this.notifications.notifyUser({
        userId: row.tenant.userId,
        orgId: ctx.orgId,
        tenantId: row.tenant.id,
        kind: 'MAINTENANCE_UPDATE',
        title: `Request ${row.number} is now ${statusLabel}`,
        body: row.resolutionNote ? `${row.title} — ${row.resolutionNote}` : row.title,
        actionUrl: '/tenant',
      });
    }

    return this.view([row])[0]!;
  }

  async convertToExpense(id: string, dto: ConvertMaintenanceToExpenseDto) {
    const before = await this.find(id);
    if (before.status === 'CANCELLED') {
      throw AppError.conflict(
        'Cancelled maintenance requests cannot be converted into expenses',
        'MAINTENANCE_CANCELLED',
      );
    }
    if (before.expense && !before.expense.voidedAt) {
      throw AppError.conflict(
        'An expense has already been recorded for this maintenance request',
        'ALREADY_CONVERTED',
      );
    }

    const expense = await this.expenses.create({
      propertyId: before.propertyId,
      category: 'REPAIRS',
      name:
        dto.name?.trim() ||
        `${before.number}: ${before.title} (Unit ${before.unit.number})`.slice(0, 160),
      payee: dto.payee,
      reference: dto.reference ?? before.number,
      amount: dto.amount,
      incurredOn: dto.incurredOn ?? todayInNairobi(),
      receiptUploadId: dto.receiptUploadId,
    });

    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.maintenanceRequest.update({
        where: { id },
        data: {
          expenseId: expense.id,
          ...(before.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}),
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          action: 'maintenance_request.convert_to_expense',
          entity: 'maintenance_request',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
        tx,
      );
      return updated;
    });

    return this.view([row])[0]!;
  }

  async photoContent(id: string, uploadId: string) {
    const req = await this.find(id);
    if (!req.photoUploadIds.includes(uploadId)) {
      throw AppError.notFound('Photo');
    }
    return this.uploads.content(uploadId);
  }

  private async find(id: string): Promise<MaintenanceRow> {
    const row = await this.db.maintenanceRequest.findFirst({
      where: { id, property: propertyScope() },
      include: INCLUDE,
    });
    if (!row) throw AppError.notFound('Maintenance request');
    return row;
  }
}
