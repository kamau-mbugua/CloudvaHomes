import { Inject, Injectable } from '@nestjs/common';
import {
  emptyContext,
  runWithContext,
  withoutOrgScope,
} from '../../../common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { FieldCipher } from '../../../common/crypto/field-cipher.js';
import { AppError } from '../../../common/errors/app-error.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { type BookingStatus, type Guest, Prisma } from '../../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { nextCode } from '../../portfolio/codes.js';
import { propertyScope } from '../../portfolio/property-scope.js';
import { assertHostOrg } from '../host-org.js';
import { parseWholeShillings } from '../listings/listings.service.js';
import { guestSms, shouldSendCheckInInfoNow } from '../rules/messages.js';
import { quoteStay, type Quote, type QuoteLine } from '../rules/pricing.js';
import { BLOCKING, canMove } from '../rules/status.js';
import {
  balanceDueOn,
  DEFAULT_RULES,
  dueNow,
  effectiveRules,
  refundFor,
  type StayRules,
} from '../rules/terms.js';
import { bookingLinkToken, bookingLinkUrl, hashAccessToken } from './booking-link.js';
import { nairobiToday, viewBooking, type RawBookingForView } from './booking-view.js';
import type {
  CalendarQueryDto,
  CancelBookingDto,
  CreateBlockDto,
  CreateHostBookingDto,
  ListBookingsQueryDto,
} from './bookings.dto.js';

const HOLD_TTL_MS = 12 * 3600_000;

export const BOOKING_INCLUDE = {
  unit: { select: { id: true, number: true } },
  property: { select: { id: true, code: true, name: true } },
  listing: { select: { id: true, title: true } },
  guest: { select: { id: true, name: true, phone: true, email: true } },
  payments: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.BookingInclude;

export function isOverlapConstraintError(e: unknown): boolean {
  if (!e) return false;
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (msg.includes('bookings_no_overlap') || msg.includes('23P01')) {
    return true;
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const raw = JSON.stringify(e.meta ?? {});
    if (raw.includes('bookings_no_overlap') || raw.includes('23P01')) {
      return true;
    }
  }
  return false;
}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly cipher: FieldCipher,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * The guest's booking-page link, for bookings made on the host's site (they carry a link
   * token). Empty for host-made bookings, which have no guest page.
   */
  async guestLink(booking: { id: string; orgId: string }): Promise<string> {
    const row = await this.db.booking.findUnique({
      where: { id: booking.id },
      select: { accessTokenHash: true },
    });
    const token = bookingLinkToken(this.cipher, booking.id);
    if (!row?.accessTokenHash || row.accessTokenHash !== hashAccessToken(token)) return '';
    const site = await this.db.hostSite.findUnique({
      where: { orgId: booking.orgId },
      select: { slug: true },
    });
    return site?.slug ? bookingLinkUrl(site.slug, this.env.SITE_DOMAIN, token) : '';
  }

  private async bizName(orgId: string): Promise<string> {
    const site = await this.db.hostSite.findUnique({
      where: { orgId },
      select: { businessName: true },
    });
    if (site?.businessName) return site.businessName;
    const org = await this.db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    return org?.name ?? 'KodiHub';
  }

  private async notifyConfirmedAfterCommit(
    orgId: string,
    booking: RawBookingForView,
    checkInInstructions?: string | null,
    link?: string | null,
  ): Promise<void> {
    const biz = await this.bizName(orgId);
    const today = nairobiToday();
    const checkInIso = formatDateOnly(booking.checkIn);
    const checkOutIso = formatDateOnly(booking.checkOut);
    if (booking.guest?.phone) {
      await this.notifications
        .sendSms(
          { kind: 'org', orgId: orgId, type: 'booking' },
          booking.guest.phone,
          guestSms('CONFIRMED', {
            biz,
            unit: booking.listing.title,
            checkIn: checkInIso,
            checkOut: checkOutIso,
            code: booking.code,
            link: link ?? '',
          }),
        )
        .catch(() => undefined);

      if (shouldSendCheckInInfoNow(checkInIso, today)) {
        const site = await this.db.hostSite.findUnique({
          where: { orgId },
          select: { checkInTime: true },
        });
        const instructions = checkInInstructions?.trim() ?? '';
        await this.notifications
          .sendSms(
            { kind: 'org', orgId: orgId, type: 'booking' },
            booking.guest.phone,
            guestSms('CHECKIN_INFO', {
              biz,
              checkIn: checkInIso,
              time: site?.checkInTime ?? '14:00',
              instructions,
            }),
          )
          .catch(() => undefined);
        await this.db.booking
          .update({
            where: { id: booking.id },
            data: { infoSentAt: new Date() },
          })
          .catch(() => undefined);
      }
    }
  }

  /**
   * Check-in details go out on confirmation when check-in is within 2 days (else the daily job
   * sends them the morning before). For bookings confirmed by a payment or on the site. Sends at
   * most once (`infoSentAt` is claimed first).
   */
  async sendCheckInInfoIfSoon(bookingId: string): Promise<void> {
    const b = await this.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        guest: { select: { phone: true } },
        listing: { select: { checkInInstructions: true } },
      },
    });
    if (!b || b.status !== 'CONFIRMED' || b.infoSentAt || !b.guest?.phone) return;
    const checkIn = formatDateOnly(b.checkIn);
    if (!shouldSendCheckInInfoNow(checkIn, nairobiToday())) return;
    const claimed = await this.db.booking.updateMany({
      where: { id: b.id, infoSentAt: null },
      data: { infoSentAt: new Date() },
    });
    if (claimed.count === 0) return;
    const site = await this.db.hostSite.findUnique({
      where: { orgId: b.orgId },
      select: { checkInTime: true },
    });
    await this.notifications
      .sendSms(
        { kind: 'org', orgId: b.orgId, type: 'booking' },
        b.guest.phone,
        guestSms('CHECKIN_INFO', {
          biz: await this.bizName(b.orgId),
          checkIn,
          time: site?.checkInTime ?? '14:00',
          instructions: b.listing.checkInInstructions?.trim() ?? '',
        }),
      )
      .catch(() => undefined);
  }

  private callerPermissions(): ReadonlySet<string> {
    try {
      return orgContext().permissions;
    } catch {
      return new Set<string>(['stay-payments:view', 'guests:view']);
    }
  }

  private async loadSiteRules(client: Db | Tx, orgId: string): Promise<StayRules> {
    const site = await client.hostSite.findUnique({
      where: { orgId },
      select: { rules: true },
    });
    if (!site || !site.rules || typeof site.rules !== 'object') {
      return { ...DEFAULT_RULES };
    }
    return effectiveRules(DEFAULT_RULES, site.rules as unknown as Partial<StayRules>);
  }

  /**
   * Price and availability for a stay. `orgId` defaults to the signed-in staff member's
   * organisation; the public booking site passes the host's (guests are never signed in).
   */
  async quote(
    listingId: string,
    checkIn: string,
    checkOut: string,
    guests: number,
    orgId: string = orgContext().orgId,
  ): Promise<{
    quote: Quote;
    rules: StayRules;
    dueNow: bigint;
    balanceDueOn: string | null;
    available: boolean;
    problems: string[];
  }> {
    await assertHostOrg(this.db, orgId);

    const checkInDate = parseDateOnly(checkIn);
    const checkOutDate = parseDateOnly(checkOut);
    if (checkOutDate.getTime() <= checkInDate.getTime()) {
      throw AppError.fieldInvalid('checkOut', 'Check-out must be after check-in');
    }

    const listing = await this.db.listing.findFirst({
      where: { id: listingId, orgId, property: propertyScope() },
      include: { specialPrices: { orderBy: { fromDate: 'asc' } } },
    });
    if (!listing) {
      throw AppError.notFound('Listing');
    }

    const siteRules = await this.loadSiteRules(this.db, orgId);
    const rules = effectiveRules(
      siteRules,
      (listing.rulesOverride as unknown as Partial<StayRules> | null) ?? null,
    );

    const q = quoteStay(checkIn, checkOut, {
      nightly: listing.nightlyPrice,
      weekend: listing.weekendPrice,
      weeklyDiscountBps: listing.weeklyDiscountBps,
      cleaningFee: listing.cleaningFee,
      special: listing.specialPrices.map((sp) => ({
        from: formatDateOnly(sp.fromDate),
        to: formatDateOnly(sp.toDate),
        nightly: sp.nightlyPrice,
      })),
    });

    const problems: string[] = [];
    if (q.nights < listing.minNights) {
      problems.push(`Minimum stay is ${listing.minNights} nights`);
    }
    if (guests > listing.maxGuests) {
      problems.push(`Maximum ${listing.maxGuests} guests`);
    }

    const overlapping = await this.db.booking.findFirst({
      where: {
        orgId,
        unitId: listing.unitId,
        status: { in: [...BLOCKING] },
        checkIn: { lt: checkOutDate },
        checkOut: { gt: checkInDate },
      },
      select: { id: true },
    });
    if (overlapping) {
      problems.push('Those dates were just taken');
    }

    const due = dueNow(rules, q.total);
    const balOn = balanceDueOn(rules, checkIn);

    return {
      quote: q,
      rules,
      dueNow: due,
      balanceDueOn: balOn,
      available: problems.length === 0,
      problems,
    };
  }

  async quoteForApi(
    listingId: string,
    checkIn: string,
    checkOut: string,
    guests: number,
    orgId: string = orgContext().orgId,
  ) {
    const res = await this.quote(listingId, checkIn, checkOut, guests, orgId);
    return {
      quote: {
        nights: res.quote.nights,
        lines: res.quote.lines,
        total: res.quote.total.toString(),
      },
      rules: res.rules,
      dueNow: res.dueNow.toString(),
      balanceDueOn: res.balanceDueOn,
      available: res.available,
      problems: res.problems,
    };
  }

  async upsertGuest(
    tx: Tx,
    orgId: string,
    input: { name: string; phone: string; email?: string | null },
  ): Promise<Guest> {
    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw AppError.fieldInvalid('guest.phone', 'Enter a valid Kenyan phone number');
    }
    const name = input.name.trim();
    const email = input.email?.trim() ? input.email.trim().toLowerCase() : undefined;

    return tx.guest.upsert({
      where: { orgId_phone: { orgId, phone } },
      create: {
        orgId,
        name,
        phone,
        email: email ?? null,
      },
      update: {
        name,
        ...(email !== undefined ? { email } : {}),
      },
    });
  }

  async insertBooking(
    tx: Tx,
    data: Prisma.BookingUncheckedCreateInput,
  ): Promise<RawBookingForView> {
    await tx.$executeRawUnsafe('SAVEPOINT sp_booking_insert');
    try {
      const created = await tx.booking.create({
        data,
        include: BOOKING_INCLUDE,
      });
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT sp_booking_insert');
      return created;
    } catch (e) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_booking_insert').catch(() => undefined);
      if (isOverlapConstraintError(e)) {
        throw AppError.conflict('Those dates were just taken', 'DATES_TAKEN');
      }
      throw e;
    }
  }

  async createByHost(dto: CreateHostBookingDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const checkInDate = parseDateOnly(dto.checkIn);
    const checkOutDate = parseDateOnly(dto.checkOut);
    if (checkOutDate.getTime() <= checkInDate.getTime()) {
      throw AppError.fieldInvalid('checkOut', 'Check-out must be after check-in');
    }

    const listing = await this.db.listing.findFirst({
      where: { id: dto.listingId, orgId: ctx.orgId, property: propertyScope() },
      include: { specialPrices: { orderBy: { fromDate: 'asc' } } },
    });
    if (!listing) {
      throw AppError.notFound('Listing');
    }

    if (dto.guests > listing.maxGuests) {
      throw AppError.fieldInvalid('guests', `Maximum ${listing.maxGuests} guests`);
    }

    const siteRules = await this.loadSiteRules(this.db, ctx.orgId);
    const rules = effectiveRules(
      siteRules,
      (listing.rulesOverride as unknown as Partial<StayRules> | null) ?? null,
    );

    const q = quoteStay(dto.checkIn, dto.checkOut, {
      nightly: listing.nightlyPrice,
      weekend: listing.weekendPrice,
      weeklyDiscountBps: listing.weeklyDiscountBps,
      cleaningFee: listing.cleaningFee,
      special: listing.specialPrices.map((sp) => ({
        from: formatDateOnly(sp.fromDate),
        to: formatDateOnly(sp.toDate),
        nightly: sp.nightlyPrice,
      })),
    });

    const lines: QuoteLine[] = [...q.lines];
    let total = q.total;

    if (dto.total !== undefined && dto.total !== null && dto.total !== '') {
      const overrideTotal = parseWholeShillings(dto.total, 'total', { allowZero: true });
      const diff = overrideTotal - q.total;
      if (diff !== 0n) {
        lines.push({
          kind: 'ADJUSTMENT',
          label: 'Host adjustment',
          amount: diff.toString(),
        });
      }
      total = overrideTotal;
    }

    const due = dueNow(rules, total);
    const balOn = balanceDueOn(rules, dto.checkIn);

    const created = await this.db.$transaction(async (tx) => {
      const code = await nextCode(tx, ctx.orgId, 'booking', 'B', 5);
      const guest = await this.upsertGuest(tx, ctx.orgId, dto.guest);
      if (guest.doNotAccept) {
        throw AppError.conflict('This guest is marked do-not-accept', 'GUEST_BLOCKED');
      }

      const row = await this.insertBooking(tx, {
        orgId: ctx.orgId,
        code,
        kind: 'STAY',
        unitId: listing.unitId,
        propertyId: listing.propertyId,
        listingId: listing.id,
        guestId: guest.id,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: dto.guests,
        status: 'CONFIRMED',
        source: 'HOST',
        total,
        dueNow: due,
        balanceDueOn: balOn ? parseDateOnly(balOn) : null,
        lines: lines as unknown as Prisma.InputJsonValue,
        rules: rules as unknown as Prisma.InputJsonValue,
        hostNote: dto.note?.trim() ? dto.note.trim() : null,
        createdById: ctx.userId,
      });

      await this.audit.record(
        {
          action: 'booking.create',
          entity: 'booking',
          entityId: row.id,
          after: {
            code: row.code,
            listingId: row.listingId,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            status: row.status,
            total: row.total.toString(),
          },
        },
        tx,
      );

      return row;
    });

    await this.notifyConfirmedAfterCommit(ctx.orgId, created, listing.checkInInstructions);
    await this.notifications.notifyOrgStaff(ctx.orgId, {
      kind: 'STAY_NEW',
      title: `New booking ${created.code}`,
      body: `${created.guest?.name ?? 'Guest'} at ${created.listing.title} (${dto.checkIn}–${dto.checkOut})`,
      actionUrl: `/app/bookings/${created.id}`,
      excludeUserId: ctx.userId,
    });

    return viewBooking(created, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async block(dto: CreateBlockDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const fromDate = parseDateOnly(dto.from);
    const toDate = parseDateOnly(dto.to);
    if (toDate.getTime() <= fromDate.getTime()) {
      throw AppError.fieldInvalid('to', 'End date must be after start date');
    }

    const listing = await this.db.listing.findFirst({
      where: { unitId: dto.unitId, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!listing) {
      throw AppError.notFound('Listing');
    }

    const created = await this.db.$transaction(async (tx) => {
      const code = await nextCode(tx, ctx.orgId, 'booking', 'B', 5);
      const row = await this.insertBooking(tx, {
        orgId: ctx.orgId,
        code,
        kind: 'BLOCK',
        unitId: listing.unitId,
        propertyId: listing.propertyId,
        listingId: listing.id,
        guestId: null,
        checkIn: fromDate,
        checkOut: toDate,
        guests: 1,
        status: 'CONFIRMED',
        source: 'HOST',
        total: 0n,
        dueNow: 0n,
        lines: [] as unknown as Prisma.InputJsonValue,
        rules: DEFAULT_RULES as unknown as Prisma.InputJsonValue,
        hostNote: dto.reason?.trim() ? dto.reason.trim() : null,
        createdById: ctx.userId,
      });

      await this.audit.record(
        {
          action: 'booking.block',
          entity: 'booking',
          entityId: row.id,
          after: { unitId: dto.unitId, from: dto.from, to: dto.to, reason: dto.reason ?? null },
        },
        tx,
      );

      return row;
    });

    return viewBooking(created, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async unblock(id: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const existing = await this.db.booking.findFirst({
      where: { id, orgId: ctx.orgId, kind: 'BLOCK', property: propertyScope() },
    });
    if (!existing) {
      throw AppError.notFound('Block');
    }

    const updated = await this.move(id, 'CANCELLED', {
      userId: ctx.userId,
      actor: 'HOST',
    });
    return viewBooking(updated, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async move(
    id: string,
    to: BookingStatus,
    by: {
      userId: string | null;
      actor: 'HOST' | 'GUEST' | 'SYSTEM';
      extra?: Prisma.BookingUncheckedUpdateInput;
    },
    txClient?: Tx,
  ): Promise<RawBookingForView> {
    const run = async (tx: Tx) => {
      const existing = await tx.booking.findFirst({
        where: { id },
        include: BOOKING_INCLUDE,
      });
      if (!existing) {
        throw AppError.notFound('Booking');
      }
      if (!canMove(existing.status, to)) {
        throw AppError.conflict(
          `Cannot move booking from ${existing.status} to ${to}`,
          'INVALID_STATUS',
        );
      }

      const now = new Date();
      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: {
          status: to,
          ...(to === 'CHECKED_IN' ? { checkedInAt: now } : {}),
          ...(to === 'COMPLETED' ? { checkedOutAt: now } : {}),
          ...(to === 'CANCELLED' ? { cancelledAt: now, cancelledBy: by.actor } : {}),
          ...by.extra,
        },
        include: BOOKING_INCLUDE,
      });

      await this.audit.record(
        {
          action: `booking.${to.toLowerCase()}`,
          entity: 'booking',
          entityId: existing.id,
          before: { status: existing.status },
          after: { status: updated.status, actor: by.actor },
        },
        tx,
      );

      return updated;
    };

    if (txClient) {
      return run(txClient);
    }
    return this.db.$transaction(run);
  }

  async accept(id: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const existing = await this.db.booking.findFirst({
      where: { id, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!existing) {
      throw AppError.notFound('Booking');
    }

    const nextStatus: BookingStatus = existing.dueNow > 0n ? 'HELD' : 'CONFIRMED';
    const holdExpiresAt = nextStatus === 'HELD' ? new Date(Date.now() + HOLD_TTL_MS) : null;

    const updated = await this.move(id, nextStatus, {
      userId: ctx.userId,
      actor: 'HOST',
      extra: { holdExpiresAt, requestExpiresAt: null },
    });

    const biz = await this.bizName(ctx.orgId);
    if (updated.guest?.phone) {
      const link = await this.guestLink({ id: updated.id, orgId: ctx.orgId });
      if (nextStatus === 'HELD') {
        await this.notifications
          .sendSms(
            { kind: 'org', orgId: ctx.orgId, type: 'booking' },
            updated.guest.phone,
            guestSms('PAY_NOW', {
              biz,
              amount: updated.dueNow,
              link,
            }),
          )
          .catch(() => undefined);
      } else {
        const listing = await this.db.listing.findUnique({
          where: { id: updated.listingId },
          select: { checkInInstructions: true },
        });
        await this.notifyConfirmedAfterCommit(
          ctx.orgId,
          updated,
          listing?.checkInInstructions,
          link,
        );
      }
    }

    return viewBooking(updated, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async decline(id: string, reason?: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const existing = await this.db.booking.findFirst({
      where: { id, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!existing) {
      throw AppError.notFound('Booking');
    }

    const updated = await this.move(id, 'DECLINED', {
      userId: ctx.userId,
      actor: 'HOST',
      extra: {
        cancelReason: reason?.trim() ? reason.trim() : null,
        requestExpiresAt: null,
      },
    });

    if (updated.guest?.phone) {
      const biz = await this.bizName(ctx.orgId);
      await this.notifications
        .sendSms(
          { kind: 'org', orgId: ctx.orgId, type: 'booking' },
          updated.guest.phone,
          guestSms('DECLINED', {
            biz,
            unit: updated.listing.title,
            checkIn: formatDateOnly(updated.checkIn),
            checkOut: formatDateOnly(updated.checkOut),
          }),
        )
        .catch(() => undefined);
    }

    return viewBooking(updated, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async checkIn(id: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const existing = await this.db.booking.findFirst({
      where: { id, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!existing) {
      throw AppError.notFound('Booking');
    }

    const updated = await this.move(id, 'CHECKED_IN', {
      userId: ctx.userId,
      actor: 'HOST',
    });

    return viewBooking(updated, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async checkOut(id: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const existing = await this.db.booking.findFirst({
      where: { id, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!existing) {
      throw AppError.notFound('Booking');
    }

    const updated = await this.db.$transaction(async (tx) => {
      const moved = await this.move(id, 'COMPLETED', { userId: ctx.userId, actor: 'HOST' }, tx);

      await tx.cleaningTask.upsert({
        where: { bookingId: moved.id },
        create: {
          orgId: ctx.orgId,
          unitId: moved.unitId,
          bookingId: moved.id,
          status: 'OPEN',
        },
        update: {},
      });

      return moved;
    });

    return viewBooking(updated, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async noShow(id: string) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const existing = await this.db.booking.findFirst({
      where: { id, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!existing) {
      throw AppError.notFound('Booking');
    }

    const updated = await this.move(id, 'NO_SHOW', {
      userId: ctx.userId,
      actor: 'HOST',
    });

    return viewBooking(updated, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async cancel(id: string, dto: CancelBookingDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const existing = await this.db.booking.findFirst({
      where: { id, orgId: ctx.orgId, property: propertyScope() },
      include: BOOKING_INCLUDE,
    });
    if (!existing) {
      throw AppError.notFound('Booking');
    }

    const today = nairobiToday();
    const netPaid =
      existing.amountPaid > existing.amountRefunded
        ? existing.amountPaid - existing.amountRefunded
        : 0n;
    const rules = (existing.rules as unknown as StayRules) ?? DEFAULT_RULES;
    const suggested = refundFor(rules, netPaid, formatDateOnly(existing.checkIn), today);

    if (dto.dryRun) {
      return { suggestedRefund: suggested.toString() };
    }

    const updated = await this.move(id, 'CANCELLED', {
      userId: ctx.userId,
      actor: 'HOST',
      extra: {
        cancelReason: dto.reason?.trim() ? dto.reason.trim() : null,
        holdExpiresAt: null,
        requestExpiresAt: null,
      },
    });

    const refundAmount =
      dto.refund !== undefined && dto.refund !== null && dto.refund !== ''
        ? parseWholeShillings(dto.refund, 'refund', { allowZero: true })
        : suggested;

    if (updated.guest?.phone) {
      const biz = await this.bizName(ctx.orgId);
      await this.notifications
        .sendSms(
          { kind: 'org', orgId: ctx.orgId, type: 'booking' },
          updated.guest.phone,
          guestSms('CANCELLED', {
            biz,
            code: updated.code,
            refund: refundAmount,
          }),
        )
        .catch(() => undefined);
    }

    await this.notifications.notifyOrgStaff(ctx.orgId, {
      kind: 'STAY_CANCELLED',
      title: `Booking ${updated.code} cancelled`,
      body: `${updated.guest?.name ?? 'Guest'} at ${updated.listing.title} was cancelled`,
      actionUrl: `/app/bookings/${updated.id}`,
      excludeUserId: ctx.userId,
    });

    return {
      ...viewBooking(updated, { permissions: this.callerPermissions() }, today),
      suggestedRefund: suggested.toString(),
    };
  }

  async get(id: string) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);

    const row = await this.db.booking.findFirst({
      where: { id, orgId, property: propertyScope() },
      include: BOOKING_INCLUDE,
    });
    if (!row) {
      throw AppError.notFound('Booking');
    }
    return viewBooking(row, { permissions: this.callerPermissions() }, nairobiToday());
  }

  async list(query: ListBookingsQueryDto) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);

    const search = query.q?.trim();

    const where: Prisma.BookingWhereInput = {
      orgId,
      kind: 'STAY',
      property: propertyScope(),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.from ? { checkOut: { gt: parseDateOnly(query.from) } } : {}),
      ...(query.to ? { checkIn: { lt: parseDateOnly(query.to) } } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { guest: { name: { contains: search, mode: 'insensitive' } } },
              { guest: { phone: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.db.booking.findMany({
        where,
        include: BOOKING_INCLUDE,
        orderBy: [{ checkIn: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(query),
      }),
      this.db.booking.count({ where }),
    ]);

    const today = nairobiToday();
    const caller = { permissions: this.callerPermissions() };
    return paginated(
      rows.map((r) => viewBooking(r, caller, today)),
      total,
      query,
    );
  }

  async calendar(query: CalendarQueryDto) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);

    const fromDate = parseDateOnly(query.from);
    const toDate = parseDateOnly(query.to);
    if (toDate.getTime() <= fromDate.getTime()) {
      throw AppError.fieldInvalid('to', 'End date must be after start date');
    }

    const listings = await this.db.listing.findMany({
      where: {
        orgId,
        property: propertyScope(),
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      },
      include: {
        unit: { select: { id: true, number: true } },
        property: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ property: { name: 'asc' } }, { unit: { number: 'asc' } }],
    });

    const bookings = await this.db.booking.findMany({
      where: {
        orgId,
        property: propertyScope(),
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        status: { in: [...BLOCKING, 'COMPLETED'] },
        checkIn: { lt: toDate },
        checkOut: { gt: fromDate },
      },
      include: {
        guest: { select: { name: true } },
      },
      orderBy: { checkIn: 'asc' },
    });

    return {
      units: listings.map((l) => ({
        unitId: l.unitId,
        listingId: l.id,
        unitNumber: l.unit.number,
        title: l.title,
        property: l.property,
      })),
      items: bookings.map((b) => ({
        id: b.id,
        unitId: b.unitId,
        listingId: b.listingId,
        kind: b.kind,
        status: b.status,
        checkIn: formatDateOnly(b.checkIn),
        checkOut: formatDateOnly(b.checkOut),
        guestName: b.guest?.name ?? null,
        hostNote: b.hostNote,
        code: b.code,
      })),
    };
  }

  /**
   * Every 5 min: expires HELD bookings past `holdExpiresAt` and REQUESTED bookings past `requestExpiresAt`,
   * and sends the guest `EXPIRED` SMS. Idempotent.
   */
  async expireAll(now: Date = new Date()): Promise<{ held: number; requests: number }> {
    const expiredBookings = await withoutOrgScope(async () => {
      return this.db.booking.findMany({
        where: {
          OR: [
            { status: 'HELD', holdExpiresAt: { lte: now } },
            { status: 'REQUESTED', requestExpiresAt: { lte: now } },
          ],
        },
        include: BOOKING_INCLUDE,
      });
    });

    let held = 0;
    let requests = 0;

    for (const b of expiredBookings) {
      await runWithContext(emptyContext({ orgId: b.orgId }), async () => {
        const updated = await this.db.booking.updateMany({
          where: { id: b.id, status: b.status },
          data: { status: 'EXPIRED' },
        });
        if (updated.count === 0) return;

        if (b.status === 'HELD') {
          held++;
        } else {
          requests++;
        }

        if (b.guest?.phone) {
          const biz = await this.bizName(b.orgId);
          await this.notifications
            .sendSms(
              { kind: 'org', orgId: b.orgId, type: 'booking' },
              b.guest.phone,
              guestSms('EXPIRED', {
                biz,
                code: b.code,
              }),
            )
            .catch(() => undefined);
        }
      });
    }

    return { held, requests };
  }

  /**
   * 07:00 Nairobi daily:
   * - `BALANCE_DUE` SMS on `balanceDueOn` for CONFIRMED/CHECKED_IN bookings with unpaid balance
   * - `CHECKIN_INFO` SMS for tomorrow's check-ins whose `infoSentAt` is null (then sets `infoSentAt`)
   * - staff `STAY_REQUEST_EXPIRING` for requests with < 6h left
   */
  async dailyAll(today: string = nairobiToday()): Promise<{
    balanceDue: number;
    checkInInfo: number;
    expiringRequests: number;
  }> {
    const todayDate = parseDateOnly(today);
    const tomorrowDate = new Date(todayDate.getTime() + 86_400_000);
    const tomorrowIso = formatDateOnly(tomorrowDate);
    const now = new Date();
    const sixHoursFromNow = new Date(now.getTime() + 6 * 3600_000);

    const [dueRows, tomorrowRows, expiringRows] = await withoutOrgScope(async () =>
      Promise.all([
        this.db.booking.findMany({
          where: {
            status: { in: ['CONFIRMED', 'CHECKED_IN'] },
            balanceDueOn: todayDate,
          },
          include: BOOKING_INCLUDE,
        }),
        this.db.booking.findMany({
          where: {
            status: 'CONFIRMED',
            checkIn: tomorrowDate,
            infoSentAt: null,
          },
          include: {
            ...BOOKING_INCLUDE,
            listing: { select: { id: true, title: true, checkInInstructions: true } },
          },
        }),
        this.db.booking.findMany({
          where: {
            status: 'REQUESTED',
            requestExpiresAt: { gt: now, lte: sixHoursFromNow },
          },
          include: BOOKING_INCLUDE,
        }),
      ]),
    );

    let balanceDueCount = 0;
    for (const b of dueRows) {
      const netPaid = b.amountPaid - b.amountRefunded;
      const owed = b.total > netPaid ? b.total - netPaid : 0n;
      if (owed <= 0n || !b.guest?.phone) continue;

      await runWithContext(emptyContext({ orgId: b.orgId }), async () => {
        const biz = await this.bizName(b.orgId);
        await this.notifications
          .sendSms(
            { kind: 'org', orgId: b.orgId, type: 'booking' },
            b.guest!.phone,
            guestSms('BALANCE_DUE', {
              biz,
              due: owed,
              checkIn: formatDateOnly(b.checkIn),
              link: await this.guestLink(b),
            }),
          )
          .catch(() => undefined);
        balanceDueCount++;
      });
    }

    let checkInInfoCount = 0;
    for (const b of tomorrowRows) {
      if (!b.guest?.phone) continue;
      await runWithContext(emptyContext({ orgId: b.orgId }), async () => {
        const claimed = await this.db.booking.updateMany({
          where: { id: b.id, infoSentAt: null },
          data: { infoSentAt: new Date() },
        });
        if (claimed.count === 0) return;

        const biz = await this.bizName(b.orgId);
        const site = await this.db.hostSite.findUnique({
          where: { orgId: b.orgId },
          select: { checkInTime: true },
        });
        await this.notifications
          .sendSms(
            { kind: 'org', orgId: b.orgId, type: 'booking' },
            b.guest!.phone,
            guestSms('CHECKIN_INFO', {
              biz,
              checkIn: tomorrowIso,
              time: site?.checkInTime ?? '14:00',
              instructions: b.listing.checkInInstructions?.trim() ?? '',
            }),
          )
          .catch(() => undefined);
        checkInInfoCount++;
      });
    }

    let expiringRequestsCount = 0;
    for (const b of expiringRows) {
      await runWithContext(emptyContext({ orgId: b.orgId }), async () => {
        await this.notifications
          .notifyOrgStaff(b.orgId, {
            kind: 'STAY_REQUEST_EXPIRING',
            title: `Booking request ${b.code} expiring soon`,
            body: `${b.guest?.name ?? 'Guest'} at ${b.listing.title} expires in under 6 hours`,
            actionUrl: `/app/bookings/${b.id}`,
          })
          .catch(() => undefined);
        expiringRequestsCount++;
      });
    }

    return {
      balanceDue: balanceDueCount,
      checkInInfo: checkInInfoCount,
      expiringRequests: expiringRequestsCount,
    };
  }
}
