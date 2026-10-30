import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ObjectStorage, sniffType } from '../../common/storage/object-storage.js';
import type { Upload, UploadPurpose } from '../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { orgContext } from '../auth/decorators.js';
import { propertyScope, unitScope } from '../portfolio/property-scope.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Who may upload / read each kind of file (any one of the permissions). */
const UPLOAD_PERMS: Record<UploadPurpose, string[]> = {
  EXPENSE_RECEIPT: ['expenses:create', 'expenses:update'],
  METER_PHOTO: ['meters:create', 'meters:update'],
  MAINTENANCE_PHOTO: ['maintenance:create', 'maintenance:update'],
  LEASE_DOCUMENT: ['tenancies:create', 'tenancies:update', 'tenants:create', 'tenants:update'],
};

export function toUpload(u: Upload) {
  return {
    id: u.id,
    purpose: u.purpose,
    contentType: u.contentType,
    size: u.size,
    createdAt: u.createdAt,
  };
}

/** Private files: stored once, attached once, served only after a permission check. */
@Injectable()
export class UploadsService {
  private readonly log = new Logger(UploadsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
  ) {}

  async create(purpose: UploadPurpose, file: { buffer: Buffer; size: number } | undefined) {
    const ctx = orgContext();
    if (!UPLOAD_PERMS[purpose].some((p) => ctx.permissions.has(p))) throw AppError.forbidden();
    if (!file?.size) throw AppError.fieldInvalid('file', 'Choose a file');
    const contentType = sniffType(file.buffer);
    if (!contentType) {
      throw new AppError(415, 'UNSUPPORTED_FILE', 'Upload a photo (JPEG, PNG or WebP) or a PDF');
    }
    const id = randomUUID();
    const key = `org/${ctx.orgId}/${purpose.toLowerCase()}/${id}`;
    await this.storage.put(key, file.buffer, contentType);
    const row = await this.db.upload.create({
      data: {
        orgId: ctx.orgId,
        purpose,
        key,
        contentType,
        size: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedById: ctx.userId,
      },
    });
    return toUpload(row);
  }

  /**
   * Marks an upload as used by a record, in the record's transaction. It must be this
   * organisation's, of the right purpose, and not attached to anything yet.
   */
  async attach(tx: Tx, id: string, purpose: UploadPurpose, field: string): Promise<void> {
    const { count } = await tx.upload.updateMany({
      where: { id, purpose, attachedAt: null },
      data: { attachedAt: new Date() },
    });
    if (!count) {
      throw new AppError(
        422,
        'UPLOAD_INVALID',
        'That file can’t be attached here. Upload it again.',
        [{ field, message: 'That file can’t be attached here. Upload it again.' }],
      );
    }
  }

  /** The file, if the caller may see the record it belongs to (or uploaded it and it's unattached). */
  async content(id: string) {
    const ctx = orgContext();
    const u = await this.db.upload.findUnique({ where: { id } });
    if (!u) throw AppError.notFound('File');
    if (!(await this.canRead(u, ctx.userId, ctx.permissions))) throw AppError.notFound('File');
    return { upload: u, data: await this.storage.get(u.key) };
  }

  private async canRead(u: Upload, userId: string, perms: ReadonlySet<string>): Promise<boolean> {
    if (!u.attachedAt) return u.uploadedById === userId;
    if (u.purpose === 'EXPENSE_RECEIPT') {
      if (!perms.has('expenses:view')) return false;
      return !!(await this.db.expense.count({
        where: { receiptUploadId: u.id, property: propertyScope() },
      }));
    }
    if (u.purpose === 'MAINTENANCE_PHOTO') {
      if (!perms.has('maintenance:view')) return false;
      return !!(await this.db.maintenanceRequest.count({
        where: { photoUploadIds: { has: u.id }, unit: unitScope() },
      }));
    }
    if (u.purpose === 'LEASE_DOCUMENT') {
      if (!perms.has('tenancies:view') && !perms.has('tenants:view')) return false;
      return !!(await this.db.tenancy.count({
        where: { leaseUploadId: u.id, unit: unitScope() },
      }));
    }
    if (!perms.has('meters:view')) return false;
    return !!(await this.db.meterReading.count({
      where: { photoUploadId: u.id, meter: { unit: unitScope() } },
    }));
  }

  /** Scheduled: files uploaded more than a day ago and never attached are deleted. */
  async cleanup(now = Date.now()) {
    const stale = await this.prisma.upload.findMany({
      where: { attachedAt: null, createdAt: { lt: new Date(now - 86_400_000) } },
      take: 500,
    });
    for (const u of stale) {
      try {
        await this.storage.delete(u.key);
        await this.prisma.upload.delete({ where: { id: u.id } });
      } catch (e) {
        this.log.error({ err: e, uploadId: u.id }, 'Could not delete an unattached upload');
      }
    }
    return { deleted: stale.length };
  }
}
