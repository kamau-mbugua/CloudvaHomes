import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import type { InspectionKind, Prisma } from '../../../generated/prisma/client.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { UploadsService } from '../../files/uploads.service.js';
import { tenancyScope } from '../property-scope.js';
import { renderInspectionPdf } from './inspection-pdf.js';
import { checkItems, type InspectionItem, photoIdsOf } from './inspection-rules.js';
import type { SaveInspectionDto } from './inspections.dto.js';

type Row = Prisma.InspectionGetPayload<object>;

function toInspection(i: Row) {
  return {
    id: i.id,
    tenancyId: i.tenancyId,
    kind: i.kind,
    inspectedOn: formatDateOnly(i.inspectedOn),
    items: i.items as unknown as InspectionItem[],
    notes: i.notes,
    inspectorName: i.inspectorName,
    tenantAcknowledgedAt: i.tenantAcknowledgedAt,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

/**
 * Move-in and move-out inspections (phase 13). One of each per tenancy; once the tenant has
 * acknowledged one, staff must reopen it (audited) to change it.
 */
@Injectable()
export class InspectionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
  ) {}

  private async tenancy(tenancyId: string) {
    const t = await this.db.tenancy.findFirst({
      where: { AND: [{ id: tenancyId }, tenancyScope()] },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { select: { id: true, number: true, property: { select: { name: true } } } },
      },
    });
    if (!t) throw AppError.notFound('Tenancy');
    return t;
  }

  async list(tenancyId: string) {
    await this.tenancy(tenancyId);
    const rows = await this.db.inspection.findMany({
      where: { tenancyId },
      orderBy: { kind: 'asc' },
    });
    return rows.map(toInspection);
  }

  async save(tenancyId: string, kind: InspectionKind, dto: SaveInspectionDto) {
    const ctx = orgContext();
    const t = await this.tenancy(tenancyId);
    const items: InspectionItem[] = dto.items.map((i) => ({
      area: i.area.trim(),
      condition: i.condition,
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
      photoUploadIds: [...new Set(i.photoUploadIds)],
    }));
    const problem = checkItems(items);
    if (problem)
      throw new AppError(422, 'INSPECTION_INVALID', problem, [
        { field: 'items', message: problem },
      ]);
    const before = await this.db.inspection.findUnique({
      where: { tenancyId_kind: { tenancyId, kind } },
    });
    if (before?.tenantAcknowledgedAt && !dto.reopen) {
      throw AppError.conflict(
        'The tenant has acknowledged this inspection. Reopen it to make changes.',
        'INSPECTION_ACKNOWLEDGED',
      );
    }
    const photoIds = photoIdsOf(items);
    const already = new Set(before?.photoUploadIds ?? []);
    const row = await this.db.$transaction(async (tx) => {
      for (const id of photoIds) {
        if (!already.has(id)) await this.uploads.attach(tx, id, 'INSPECTION_PHOTO', 'items');
      }
      // Photos dropped from the checklist are released so the clean-up job deletes them.
      const dropped = [...already].filter((id) => !photoIds.includes(id));
      if (dropped.length) {
        await tx.upload.updateMany({
          where: { id: { in: dropped } },
          data: { attachedAt: null, createdAt: new Date(0) },
        });
      }
      const data = {
        inspectedOn: parseDateOnly(dto.inspectedOn),
        items: items as unknown as Prisma.InputJsonValue,
        notes: dto.notes?.trim() || null,
        inspectorName: dto.inspectorName?.trim() || null,
        photoUploadIds: photoIds,
        tenantAcknowledgedAt: null,
      };
      const saved = await tx.inspection.upsert({
        where: { tenancyId_kind: { tenancyId, kind } },
        create: {
          ...data,
          orgId: ctx.orgId,
          tenancyId,
          unitId: t.unit.id,
          kind,
          createdById: ctx.userId,
        },
        update: data,
      });
      await this.audit.record(
        {
          action: before?.tenantAcknowledgedAt ? 'inspection.reopen' : 'inspection.save',
          entity: 'tenancy',
          entityId: tenancyId,
          before: before
            ? { kind, items: before.items, acknowledged: !!before.tenantAcknowledgedAt }
            : null,
          after: { kind, items: data.items },
        },
        tx,
      );
      return saved;
    });
    return toInspection(row);
  }

  private async find(tenancyId: string, kind: InspectionKind) {
    await this.tenancy(tenancyId);
    const i = await this.db.inspection.findUnique({
      where: { tenancyId_kind: { tenancyId, kind } },
    });
    if (!i) throw AppError.notFound('Inspection');
    return i;
  }

  async pdf(tenancyId: string, kind: InspectionKind) {
    const t = await this.tenancy(tenancyId);
    const i = await this.find(tenancyId, kind);
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgContext().orgId },
      select: { name: true },
    });
    return renderInspectionPdf({
      organization: org.name,
      kind,
      inspectedOn: formatDateOnly(i.inspectedOn),
      inspectorName: i.inspectorName,
      notes: i.notes,
      tenantName: `${t.tenant.firstName} ${t.tenant.lastName}`,
      unit: t.unit.number,
      property: t.unit.property.name,
      acknowledgedAt: i.tenantAcknowledgedAt,
      items: i.items as unknown as InspectionItem[],
    });
  }

  async photo(tenancyId: string, kind: InspectionKind, uploadId: string) {
    const i = await this.find(tenancyId, kind);
    if (!i.photoUploadIds.includes(uploadId)) throw AppError.notFound('Photo');
    return this.uploads.content(uploadId);
  }

  /** Tenant portal: the tenant confirms they have seen it. */
  async acknowledge(tenancyId: string, kind: InspectionKind) {
    const i = await this.find(tenancyId, kind);
    if (i.tenantAcknowledgedAt) return toInspection(i);
    const row = await this.db.inspection.update({
      where: { id: i.id },
      data: { tenantAcknowledgedAt: new Date() },
    });
    await this.audit.record({
      action: 'inspection.acknowledge',
      entity: 'tenancy',
      entityId: tenancyId,
      before: null,
      after: { kind },
    });
    return toInspection(row);
  }
}
