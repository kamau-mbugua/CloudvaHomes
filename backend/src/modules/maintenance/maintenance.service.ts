import { Inject, Injectable } from '@nestjs/common';
import { currentContext, withoutOrgScope } from '../../common/context/request-context.js';
import { formatDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { type PaginationQueryDto, pageMeta, toSkipTake } from '../../common/http/pagination.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { MaintenanceRequest, Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { randomToken, sha256 } from '../auth/crypto.js';
import { orgContext } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { UploadsService } from '../files/uploads.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { nextCode } from '../portfolio/codes.js';
import { optionalText } from '../portfolio/fields.js';
import { isOverdue, overdueWhere } from './sla.js';
import { VendorsService } from './vendors.service.js';
import { propertyScope } from '../portfolio/property-scope.js';
import type {
  ConvertMaintenanceToExpenseDto,
  CreateMaintenanceRequestDto,
  CreateTenantMaintenanceRequestDto,
  ListMaintenanceQueryDto,
  UpdateMaintenanceRequestDto,
  VendorCompleteJobDto,
} from './maintenance.dto.js';

/** Photos a vendor can add to a job through their link. */
const MAX_VENDOR_PHOTOS = 10;

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
  vendor: { select: { id: true, name: true, phone: true } },
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
  vendor: { id: string; name: string; phone: string } | null;
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
    private readonly vendors: VendorsService,
    private readonly cipher: FieldCipher,
    private readonly rateLimit: RateLimitService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private vendorUrl(token: string): string {
    return `${this.env.APP_URL.replace(/\/$/, '')}/r/${token}`;
  }

  /** A new vendor link: the hash finds it, the encrypted copy lets staff copy it again. */
  private newVendorToken(orgId: string) {
    const token = randomToken();
    return {
      token,
      data: {
        vendorTokenHash: sha256(token),
        vendorTokenEnc: this.cipher.encrypt(token, `${orgId}:maintenance.vendorToken`),
      },
    };
  }

  private openVendorToken(row: { orgId: string; vendorTokenEnc: Uint8Array | null }) {
    return row.vendorTokenEnc
      ? this.cipher.decrypt(row.vendorTokenEnc, `${row.orgId}:maintenance.vendorToken`)
      : null;
  }

  /** The vendor's job link, made on first use. Only for a job with a vendor on it. */
  async getVendorLink(id: string) {
    const row = await this.find(id);
    if (!row.vendorId) throw AppError.conflict('Assign a vendor first', 'NO_VENDOR');
    const token =
      this.openVendorToken(row) ??
      (await this.setVendorToken(row, 'maintenance.vendor_link_create'));
    return { url: this.vendorUrl(token) };
  }

  /** A new vendor link; the old one stops working. */
  async rotateVendorLink(id: string) {
    const row = await this.find(id);
    if (!row.vendorId) throw AppError.conflict('Assign a vendor first', 'NO_VENDOR');
    const token = await this.setVendorToken(row, 'maintenance.vendor_link_rotate');
    return { url: this.vendorUrl(token) };
  }

  private async setVendorToken(row: { id: string; orgId: string }, action: string) {
    const { token, data } = this.newVendorToken(row.orgId);
    await this.db.$transaction(async (tx) => {
      await tx.maintenanceRequest.update({ where: { id: row.id }, data });
      await this.audit.record({ action, entity: 'maintenance_request', entityId: row.id }, tx);
    });
    return token;
  }

  /**
   * Phase 18: send the job to a vendor (or take it back). Assigning starts an open job and by
   * default texts the vendor the job, their link and the organisation's number for access —
   * not the tenant's. A different vendor gets a new link (the previous vendor's stops
   * working); taking the vendor off removes it. Audited.
   */
  async assign(id: string, vendorId: string | null, notify = true) {
    const before = await this.find(id);
    if (before.status === 'RESOLVED' || before.status === 'CANCELLED') {
      throw AppError.conflict('This job is closed', 'MAINTENANCE_CLOSED');
    }
    const vendor = vendorId ? await this.vendors.find(vendorId) : null;
    if (vendor && !vendor.active)
      throw AppError.fieldInvalid('vendorId', 'This vendor is archived');
    const kept = vendor && vendor.id === before.vendorId ? this.openVendorToken(before) : null;
    const fresh = vendor && !kept ? this.newVendorToken(before.orgId) : null;
    const token = kept ?? fresh?.token ?? null;
    await this.db.$transaction(async (tx) => {
      await tx.maintenanceRequest.update({
        where: { id },
        data: {
          vendorId: vendor?.id ?? null,
          assignedAt: vendor ? new Date() : null,
          ...(fresh ? fresh.data : vendor ? {} : { vendorTokenHash: null, vendorTokenEnc: null }),
          ...(vendor && before.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}),
        },
      });
      await this.audit.record(
        {
          action: vendor ? 'maintenance.assign' : 'maintenance.unassign',
          entity: 'maintenance_request',
          entityId: id,
          before: { vendorId: before.vendorId, status: before.status },
          after: { vendorId: vendor?.id ?? null },
        },
        tx,
      );
    });
    let notified = false;
    if (vendor && token && notify) {
      const org = await this.db.organization.findUniqueOrThrow({
        where: { id: before.orgId },
        select: { name: true, phone: true },
      });
      const text =
        `${org.name}: job ${before.number} — ${before.title} (${before.priority.toLowerCase()}) at ` +
        `${before.unit.number}, ${before.property.name}. Details: ${this.vendorUrl(token)} ` +
        `Access: call ${org.phone}.`;
      try {
        await this.notifications.sendVendorJob(before.orgId, vendor.phone, text);
        notified = true;
      } catch {
        notified = false;
      }
    }
    return { ...(await this.get(id)), vendorNotified: notified };
  }

  private view(rows: MaintenanceRow[]) {
    const perms = currentContext()?.permissions ?? new Set<string>();
    const canUpdate = perms.has('maintenance:update');
    const canCreateExpense = perms.has('expenses:create');
    const now = new Date();

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
        vendorNote: r.vendorNote,
        vendorPhotoUploadIds: r.vendorPhotoUploadIds,
        vendorCompletedAt: r.vendorCompletedAt,
        hasVendorLink: Boolean(r.vendorTokenHash),
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
        vendor: r.vendor,
        assignedAt: r.assignedAt,
        overdue: isOverdue(r, now),
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
        q.vendorId ? { vendorId: q.vendorId } : {},
        q.late ? overdueWhere(new Date()) : {},
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
    if (!req.photoUploadIds.includes(uploadId) && !req.vendorPhotoUploadIds.includes(uploadId)) {
      throw AppError.notFound('Photo');
    }
    return this.uploads.content(uploadId);
  }

  // ── Public vendor repair link (/api/v1/public/vendor-jobs/:token) ──

  /**
   * The job behind a vendor link. Rate-limited per address (and per link for writes) since it
   * needs no sign-in. A link works while a vendor is on the job and for 7 days after it closes.
   */
  private async findByVendorToken(token: string, use: 'view' | 'photo' | 'write' = 'view') {
    const ip = currentContext()?.ip ?? 'unknown';
    await this.rateLimit.hit(
      { key: `vendor-job:ip:${ip}`, limit: 300, windowSeconds: 3600 },
      ...(use === 'photo'
        ? [{ key: `vendor-job:photo:${sha256(token ?? '')}`, limit: 30, windowSeconds: 3600 }]
        : use === 'write'
          ? [{ key: `vendor-job:write:${sha256(token ?? '')}`, limit: 20, windowSeconds: 3600 }]
          : []),
    );
    const clean = token?.trim();
    if (!clean || clean.length < 16) throw AppError.notFound('Job');
    return withoutOrgScope(async () => {
      const row = await this.db.maintenanceRequest.findUnique({
        where: { vendorTokenHash: sha256(clean) },
        include: {
          property: { select: { name: true, location: true } },
          unit: { select: { number: true, floor: true } },
          vendor: { select: { name: true } },
        },
      });
      if (!row || !row.vendorId) throw AppError.notFound('Job');
      const closedLongAgo =
        (row.status === 'RESOLVED' || row.status === 'CANCELLED') &&
        (row.resolvedAt ?? row.updatedAt).getTime() < Date.now() - 7 * 24 * 3_600_000;
      if (closedLongAgo) throw AppError.notFound('Job');
      const org = await this.db.organization.findUniqueOrThrow({
        where: { id: row.orgId },
        select: { name: true, phone: true },
      });
      return { row, org };
    });
  }

  private toPublicVendorJob(
    row: {
      number: string;
      title: string;
      description: string;
      category: string;
      priority: string;
      status: string;
      photoUploadIds: string[];
      vendorNote: string | null;
      vendorPhotoUploadIds: string[];
      vendorCompletedAt: Date | null;
      property: { name: string; location: string | null };
      unit: { number: string; floor: number };
      vendor: { name: string } | null;
    },
    org: { name: string; phone: string },
  ) {
    return {
      number: row.number,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      property: { name: row.property.name, location: row.property.location },
      unit: { number: row.unit.number, floor: row.unit.floor },
      organization: { name: org.name, phone: org.phone },
      vendor: row.vendor ? { name: row.vendor.name } : null,
      photoUploadIds: row.photoUploadIds,
      vendorNote: row.vendorNote,
      vendorPhotoUploadIds: row.vendorPhotoUploadIds,
      vendorCompletedAt: row.vendorCompletedAt,
    };
  }

  async getPublicJob(token: string) {
    const { row, org } = await this.findByVendorToken(token);
    return this.toPublicVendorJob(row, org);
  }

  async publicJobPhotoContent(token: string, uploadId: string) {
    const { row } = await this.findByVendorToken(token);
    const allowed = [...row.photoUploadIds, ...row.vendorPhotoUploadIds];
    return this.uploads.vendorJobPhotoContent(row.orgId, uploadId, allowed);
  }

  async uploadPublicJobPhoto(token: string, file: { buffer: Buffer; size: number } | undefined) {
    const { row } = await this.findByVendorToken(token, 'photo');
    if (row.status === 'RESOLVED' || row.status === 'CANCELLED') {
      throw AppError.conflict('This job is closed', 'MAINTENANCE_CLOSED');
    }
    if (row.vendorPhotoUploadIds.length >= MAX_VENDOR_PHOTOS) {
      throw AppError.fieldInvalid('file', `At most ${MAX_VENDOR_PHOTOS} completion photos`);
    }
    const upload = await this.uploads.createForVendor(
      row.orgId,
      row.vendorId ?? row.createdById ?? row.id,
      file,
    );
    // Attached to the job straight away, so a vendor who closes the page before sending the
    // report doesn't lose the photo.
    await withoutOrgScope(() =>
      this.db.$transaction(async (tx) => {
        await tx.upload.update({ where: { id: upload.id }, data: { attachedAt: new Date() } });
        await tx.maintenanceRequest.update({
          where: { id: row.id },
          data: { vendorPhotoUploadIds: { push: upload.id } },
        });
      }),
    );
    return upload;
  }

  async completePublicJob(token: string, dto: VendorCompleteJobDto) {
    const { row, org } = await this.findByVendorToken(token, 'write');
    if (row.status === 'RESOLVED' || row.status === 'CANCELLED') {
      throw AppError.conflict('This job is closed', 'MAINTENANCE_CLOSED');
    }

    const incomingIds = [...new Set(dto.photoUploadIds ?? [])];
    const combinedPhotos = [...new Set([...row.vendorPhotoUploadIds, ...incomingIds])];
    if (combinedPhotos.length > MAX_VENDOR_PHOTOS) {
      throw AppError.fieldInvalid(
        'photoUploadIds',
        `At most ${MAX_VENDOR_PHOTOS} completion photos`,
      );
    }
    const newIds = incomingIds.filter((id) => !row.vendorPhotoUploadIds.includes(id));
    const nextNote = dto.note !== undefined ? (optionalText(dto.note) ?? null) : row.vendorNote;

    const updated = await withoutOrgScope(() =>
      this.db.$transaction(async (tx) => {
        for (const uploadId of newIds) {
          const { count } = await tx.upload.updateMany({
            where: {
              id: uploadId,
              orgId: row.orgId,
              purpose: 'MAINTENANCE_PHOTO',
              attachedAt: null,
            },
            data: { attachedAt: new Date() },
          });
          if (!count) {
            throw new AppError(
              422,
              'UPLOAD_INVALID',
              'That photo can’t be attached here. Upload it again.',
              [
                {
                  field: 'photoUploadIds',
                  message: 'That photo can’t be attached here. Upload it again.',
                },
              ],
            );
          }
        }
        await this.audit.record(
          {
            orgId: row.orgId,
            action: 'maintenance.vendor_report',
            entity: 'maintenance_request',
            entityId: row.id,
            after: { vendorId: row.vendorId, note: nextNote, photos: combinedPhotos.length },
          },
          tx,
        );
        return tx.maintenanceRequest.update({
          where: { id: row.id },
          data: {
            vendorNote: nextNote,
            vendorPhotoUploadIds: combinedPhotos,
            vendorCompletedAt: new Date(),
            ...(row.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}),
          },
          include: {
            property: { select: { name: true, location: true } },
            unit: { select: { number: true, floor: true } },
            vendor: { select: { name: true } },
          },
        });
      }),
    );

    const vendorName = updated.vendor?.name ?? 'Vendor';
    await this.notifications.notifyOrgStaff(row.orgId, {
      kind: 'MAINTENANCE_UPDATE',
      title: `Vendor marked ${updated.number} done`,
      body: `${vendorName} reported work complete on ${updated.title} (${updated.property.name} · Unit ${updated.unit.number}).`,
      actionUrl: '/maintenance',
    });

    return this.toPublicVendorJob(updated, org);
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
