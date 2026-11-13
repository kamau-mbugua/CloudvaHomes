import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { UploadsService } from '../../files/uploads.service.js';
import { MAX_MINOR } from '../../portfolio/money.dto.js';
import { propertyScope } from '../../portfolio/property-scope.js';
import { assertHostOrg } from '../host-org.js';
import { rulesProblem, type StayRules } from '../rules/terms.js';
import { locationView } from '../rules/location.js';
import type {
  ListingLocationDto,
  CreateListingDto,
  ListListingsQueryDto,
  ReorderPhotosDto,
  ReplaceSpecialPricesDto,
  UpdateListingDto,
} from './listings.dto.js';

export const MAX_LISTING_PHOTOS = 20;

const INCLUDE = {
  unit: { select: { id: true, number: true, floor: true } },
  property: { select: { id: true, code: true, name: true, location: true, county: true } },
  photos: { orderBy: { position: 'asc' as const } },
  specialPrices: { orderBy: { fromDate: 'asc' as const } },
} satisfies Prisma.ListingInclude;

type ListingRow = Prisma.ListingGetPayload<{ include: typeof INCLUDE }>;

export function parseWholeShillings(
  raw: string,
  field: string,
  opts: { allowZero?: boolean } = {},
): bigint {
  const s = (raw ?? '').trim();
  if (!/^\d+$/.test(s)) {
    throw AppError.fieldInvalid(field, 'Use whole shillings');
  }
  const v = BigInt(s);
  if (v > BigInt(MAX_MINOR)) {
    throw AppError.fieldInvalid(field, 'Amount is too large');
  }
  if (v % 100n !== 0n) {
    throw AppError.fieldInvalid(field, 'Use whole shillings');
  }
  if (!opts.allowZero && v <= 0n) {
    throw AppError.fieldInvalid(field, 'Price must be greater than zero');
  }
  return v;
}

function toPhotoView(p: {
  id: string;
  uploadId: string;
  position: number;
  caption: string | null;
}) {
  return {
    id: p.id,
    uploadId: p.uploadId,
    position: p.position,
    caption: p.caption,
    url: `/api/v1/public/photos/${p.uploadId}`,
  };
}

/** The four location columns from the editor's choice (null clears them). */
function locationData(loc: ListingLocationDto | null | undefined) {
  if (!loc) return { address: null, lat: null, lng: null, placeId: null };
  return {
    address: loc.address.trim(),
    lat: loc.lat,
    lng: loc.lng,
    placeId: loc.placeId?.trim() || null,
  };
}

export function toListingView(l: ListingRow) {
  const photos = l.photos.map(toPhotoView);
  const cover = photos[0] ?? null;
  return {
    id: l.id,
    unitId: l.unitId,
    propertyId: l.propertyId,
    unit: l.unit,
    property: l.property,
    title: l.title,
    description: l.description,
    area: l.area,
    location: locationView(l),
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    maxGuests: l.maxGuests,
    amenities: l.amenities,
    nightlyPrice: l.nightlyPrice.toString(),
    weekendPrice: l.weekendPrice !== null ? l.weekendPrice.toString() : null,
    cleaningFee: l.cleaningFee.toString(),
    weeklyDiscountBps: l.weeklyDiscountBps,
    minNights: l.minNights,
    checkInInstructions: l.checkInInstructions,
    rulesOverride: (l.rulesOverride as unknown as StayRules | null) ?? null,
    published: l.published,
    coverPhotoId: cover?.id ?? null,
    coverUploadId: cover?.uploadId ?? null,
    coverUrl: cover?.url ?? null,
    photos,
    specialPrices: l.specialPrices.map((sp) => ({
      id: sp.id,
      fromDate: formatDateOnly(sp.fromDate),
      toDate: formatDateOnly(sp.toDate),
      nightlyPrice: sp.nightlyPrice.toString(),
      label: sp.label,
    })),
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

@Injectable()
export class ListingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
  ) {}

  private async findScoped(id: string): Promise<ListingRow> {
    const row = await this.db.listing.findFirst({
      where: { id, property: propertyScope() },
      include: INCLUDE,
    });
    if (!row) throw AppError.notFound('Listing');
    return row;
  }

  async mapsConfig(): Promise<{ key: string | null }> {
    const s = await this.db.platformSettings.findUnique({
      where: { id: 1 },
      select: { googleMapsKey: true },
    });
    return { key: s?.googleMapsKey ?? null };
  }

  async list(q: ListListingsQueryDto) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);
    const where: Prisma.ListingWhereInput = {
      property: propertyScope(),
      ...(q.propertyId ? { propertyId: q.propertyId } : {}),
      ...(q.published !== undefined ? { published: q.published } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.listing.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.listing.count({ where }),
    ]);
    return paginated(rows.map(toListingView), total, q);
  }

  async get(id: string) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);
    return toListingView(await this.findScoped(id));
  }

  async create(dto: CreateListingDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const prop = await this.db.property.findFirst({
      where: { AND: [{ id: dto.propertyId }, propertyScope()] },
      select: { id: true },
    });
    if (!prop) throw AppError.fieldInvalid('propertyId', 'Choose a property');

    const nightlyPrice = parseWholeShillings(dto.nightlyPrice, 'nightlyPrice');
    const weekendPrice =
      dto.weekendPrice !== undefined && dto.weekendPrice !== null
        ? parseWholeShillings(dto.weekendPrice, 'weekendPrice')
        : null;
    const cleaningFee =
      dto.cleaningFee !== undefined
        ? parseWholeShillings(dto.cleaningFee, 'cleaningFee', { allowZero: true })
        : 0n;

    if (dto.rulesOverride !== undefined && dto.rulesOverride !== null) {
      const problem = rulesProblem(dto.rulesOverride);
      if (problem) throw AppError.fieldInvalid('rulesOverride', problem);
    }

    const amenities = (dto.amenities ?? []).map((a) => a.trim()).filter(Boolean);

    try {
      const created = await this.db.$transaction(async (tx) => {
        // A unit with this number may already exist (e.g. from the portfolio CSV import):
        // turn it into a listing instead of failing; a unit gets at most one listing.
        const number = dto.unitNumber.trim();
        const existing = await tx.unit.findFirst({
          where: { orgId: ctx.orgId, propertyId: dto.propertyId, number },
          select: { id: true, listing: { select: { id: true } } },
        });
        if (existing?.listing) {
          throw AppError.conflict(
            `Unit ${number} in that property already has a listing`,
            'UNIT_ALREADY_LISTED',
          );
        }
        const unit =
          existing ??
          (await tx.unit.create({
            data: {
              orgId: ctx.orgId,
              propertyId: dto.propertyId,
              number,
              rentAmount: 0n,
            },
          }));
        const row = await tx.listing.create({
          data: {
            orgId: ctx.orgId,
            unitId: unit.id,
            propertyId: dto.propertyId,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            area: dto.area?.trim() || null,
            ...locationData(dto.location),
            bedrooms: dto.bedrooms ?? 1,
            bathrooms: dto.bathrooms ?? 1,
            maxGuests: dto.maxGuests ?? 2,
            amenities,
            nightlyPrice,
            weekendPrice,
            cleaningFee,
            weeklyDiscountBps: dto.weeklyDiscountBps ?? null,
            minNights: dto.minNights ?? 1,
            checkInInstructions: dto.checkInInstructions?.trim() || null,
            ...(dto.rulesOverride !== undefined && dto.rulesOverride !== null
              ? { rulesOverride: dto.rulesOverride as unknown as Prisma.InputJsonValue }
              : {}),
            published: dto.published ?? false,
          },
          include: INCLUDE,
        });
        await this.audit.record(
          {
            action: 'listing.create',
            entity: 'listing',
            entityId: row.id,
            after: toListingView(row),
          },
          tx,
        );
        return row;
      });
      return toListingView(created);
    } catch (e) {
      if (violatesUnique(e, 'number')) {
        throw AppError.conflict(
          'A unit with this number already exists in that property',
          'UNIT_NUMBER_TAKEN',
        );
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateListingDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const before = await this.findScoped(id);

    const nightlyPrice =
      dto.nightlyPrice !== undefined
        ? parseWholeShillings(dto.nightlyPrice, 'nightlyPrice')
        : undefined;
    const weekendPrice =
      dto.weekendPrice !== undefined
        ? dto.weekendPrice === null
          ? null
          : parseWholeShillings(dto.weekendPrice, 'weekendPrice')
        : undefined;
    const cleaningFee =
      dto.cleaningFee !== undefined
        ? parseWholeShillings(dto.cleaningFee, 'cleaningFee', { allowZero: true })
        : undefined;

    if (dto.rulesOverride !== undefined && dto.rulesOverride !== null) {
      const problem = rulesProblem(dto.rulesOverride);
      if (problem) throw AppError.fieldInvalid('rulesOverride', problem);
    }

    try {
      const updated = await this.db.$transaction(async (tx) => {
        if (dto.unitNumber !== undefined) {
          await tx.unit.update({
            where: { id: before.unitId },
            data: { number: dto.unitNumber.trim() },
          });
        }
        const row = await tx.listing.update({
          where: { id },
          data: {
            ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description?.trim() || null }
              : {}),
            ...(dto.area !== undefined ? { area: dto.area?.trim() || null } : {}),
            ...(dto.location !== undefined ? locationData(dto.location) : {}),
            ...(dto.bedrooms !== undefined ? { bedrooms: dto.bedrooms } : {}),
            ...(dto.bathrooms !== undefined ? { bathrooms: dto.bathrooms } : {}),
            ...(dto.maxGuests !== undefined ? { maxGuests: dto.maxGuests } : {}),
            ...(dto.amenities !== undefined
              ? { amenities: dto.amenities.map((a) => a.trim()).filter(Boolean) }
              : {}),
            ...(nightlyPrice !== undefined ? { nightlyPrice } : {}),
            ...(weekendPrice !== undefined ? { weekendPrice } : {}),
            ...(cleaningFee !== undefined ? { cleaningFee } : {}),
            ...(dto.weeklyDiscountBps !== undefined
              ? { weeklyDiscountBps: dto.weeklyDiscountBps }
              : {}),
            ...(dto.minNights !== undefined ? { minNights: dto.minNights } : {}),
            ...(dto.checkInInstructions !== undefined
              ? { checkInInstructions: dto.checkInInstructions?.trim() || null }
              : {}),
            ...(dto.rulesOverride !== undefined
              ? {
                  rulesOverride:
                    dto.rulesOverride === null
                      ? Prisma.DbNull
                      : (dto.rulesOverride as unknown as Prisma.InputJsonValue),
                }
              : {}),
            ...(dto.published !== undefined ? { published: dto.published } : {}),
          },
          include: INCLUDE,
        });
        await this.audit.record(
          {
            action: 'listing.update',
            entity: 'listing',
            entityId: id,
            before: toListingView(before),
            after: toListingView(row),
          },
          tx,
        );
        return row;
      });
      return toListingView(updated);
    } catch (e) {
      if (violatesUnique(e, 'number')) {
        throw AppError.conflict(
          'A unit with this number already exists in that property',
          'UNIT_NUMBER_TAKEN',
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const before = await this.findScoped(id);

    const bookingsCount = await this.db.booking.count({ where: { listingId: id } });
    if (bookingsCount > 0) {
      throw AppError.conflict(
        'This listing has bookings. Unpublish it instead of deleting.',
        'LISTING_HAS_BOOKINGS',
      );
    }

    await this.db.$transaction(async (tx) => {
      const uploadIds = before.photos.map((p) => p.uploadId);
      if (uploadIds.length > 0) {
        await tx.upload.updateMany({
          where: { id: { in: uploadIds } },
          data: { attachedAt: null, createdAt: new Date(0) },
        });
      }
      await tx.listing.delete({ where: { id } });
      await tx.unit.delete({ where: { id: before.unitId } });
      await this.audit.record(
        {
          action: 'listing.delete',
          entity: 'listing',
          entityId: id,
          before: toListingView(before),
        },
        tx,
      );
    });
  }

  async addPhoto(id: string, file: { buffer: Buffer; size: number } | undefined) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const listing = await this.findScoped(id);
    if (listing.photos.length >= MAX_LISTING_PHOTOS) {
      throw AppError.fieldInvalid(
        'file',
        `A listing can have at most ${MAX_LISTING_PHOTOS} photos`,
      );
    }

    const uploaded = await this.uploads.create('LISTING_PHOTO', file);
    const nextPos =
      listing.photos.length === 0 ? 0 : Math.max(...listing.photos.map((p) => p.position)) + 1;

    const photo = await this.db.$transaction(async (tx) => {
      await this.uploads.attach(tx, uploaded.id, 'LISTING_PHOTO', 'file');
      const created = await tx.listingPhoto.create({
        data: {
          orgId: ctx.orgId,
          listingId: id,
          uploadId: uploaded.id,
          position: nextPos,
        },
      });
      await this.audit.record(
        {
          action: 'listing.photo_add',
          entity: 'listing',
          entityId: id,
          after: { photoId: created.id, uploadId: uploaded.id, position: nextPos },
        },
        tx,
      );
      return created;
    });
    return toPhotoView(photo);
  }

  async reorderPhotos(id: string, dto: ReorderPhotosDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const listing = await this.findScoped(id);

    const existingIds = listing.photos.map((p) => p.id);
    const uniqueProvided = new Set(dto.photoIds);
    if (
      dto.photoIds.length !== existingIds.length ||
      uniqueProvided.size !== existingIds.length ||
      !existingIds.every((pid) => uniqueProvided.has(pid))
    ) {
      throw AppError.fieldInvalid('photoIds', 'Provide all photo IDs for this listing once');
    }

    const updated = await this.db.$transaction(async (tx) => {
      for (const [idx, photoId] of dto.photoIds.entries()) {
        await tx.listingPhoto.update({
          where: { id: photoId },
          data: { position: idx },
        });
      }
      const after = await tx.listing.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      await this.audit.record(
        {
          action: 'listing.photos_reorder',
          entity: 'listing',
          entityId: id,
          before: { photoIds: existingIds },
          after: { photoIds: dto.photoIds },
        },
        tx,
      );
      return after;
    });
    return toListingView(updated);
  }

  async deletePhoto(id: string, photoId: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const listing = await this.findScoped(id);
    const target = listing.photos.find((p) => p.id === photoId);
    if (!target) throw AppError.notFound('Photo');

    const updated = await this.db.$transaction(async (tx) => {
      await tx.listingPhoto.delete({ where: { id: photoId } });
      await tx.upload.updateMany({
        where: { id: target.uploadId },
        data: { attachedAt: null, createdAt: new Date(0) },
      });
      const remaining = listing.photos.filter((p) => p.id !== photoId);
      for (const [idx, p] of remaining.entries()) {
        if (p.position !== idx) {
          await tx.listingPhoto.update({ where: { id: p.id }, data: { position: idx } });
        }
      }
      const after = await tx.listing.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      await this.audit.record(
        {
          action: 'listing.photo_delete',
          entity: 'listing',
          entityId: id,
          before: { photoId, uploadId: target.uploadId },
        },
        tx,
      );
      return after;
    });
    return toListingView(updated);
  }

  async replaceSpecialPrices(id: string, dto: ReplaceSpecialPricesDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const before = await this.findScoped(id);

    const parsed = dto.items.map((item, idx) => {
      if (item.fromDate > item.toDate) {
        throw AppError.fieldInvalid(
          `items[${idx}].toDate`,
          'End date must be on or after start date',
        );
      }
      return {
        fromDateStr: item.fromDate,
        toDateStr: item.toDate,
        fromDate: parseDateOnly(item.fromDate),
        toDate: parseDateOnly(item.toDate),
        nightlyPrice: parseWholeShillings(item.nightlyPrice, `items[${idx}].nightlyPrice`),
        label: item.label?.trim() || null,
      };
    });

    const sorted = [...parsed].sort((a, b) => a.fromDateStr.localeCompare(b.fromDateStr));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.fromDateStr <= sorted[i - 1]!.toDateStr) {
        throw AppError.fieldInvalid('items', 'Special price date ranges cannot overlap');
      }
    }

    const updated = await this.db.$transaction(async (tx) => {
      await tx.specialPrice.deleteMany({ where: { listingId: id } });
      for (const sp of sorted) {
        await tx.specialPrice.create({
          data: {
            orgId: ctx.orgId,
            listingId: id,
            fromDate: sp.fromDate,
            toDate: sp.toDate,
            nightlyPrice: sp.nightlyPrice,
            label: sp.label,
          },
        });
      }
      const after = await tx.listing.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      await this.audit.record(
        {
          action: 'listing.special_prices',
          entity: 'listing',
          entityId: id,
          before: { specialPrices: toListingView(before).specialPrices },
          after: { specialPrices: toListingView(after).specialPrices },
        },
        tx,
      );
      return after;
    });
    return toListingView(updated);
  }
}
