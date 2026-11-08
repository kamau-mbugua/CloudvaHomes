import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  emptyContext,
  runWithContext,
  withoutOrgScope,
} from '../../../common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { FieldCipher } from '../../../common/crypto/field-cipher.js';
import { AppError } from '../../../common/errors/app-error.js';
import { RateLimitService } from '../../../common/rate-limit/rate-limit.service.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { type BookingStatus, Prisma } from '../../../generated/prisma/client.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { OTP_TTL_MINUTES, OtpService } from '../../auth/otp.service.js';
import { DarajaConfigService } from '../../mpesa/daraja-config.service.js';
import { StkService } from '../../mpesa/stk.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { nextCode } from '../../portfolio/codes.js';
import { BOOKING_INCLUDE, BookingsService } from '../bookings/bookings.service.js';
import { bookingLinkToken, bookingLinkUrl, hashAccessToken } from '../bookings/booking-link.js';
import { nairobiToday } from '../bookings/booking-view.js';
import { formatStayKes, guestSms } from '../rules/messages.js';
import { quoteStay } from '../rules/pricing.js';
import { BLOCKING } from '../rules/status.js';
import {
  balanceDueOn,
  DEFAULT_RULES,
  describeCancellation,
  dueNow,
  effectiveRules,
  refundFor,
  type StayRules,
} from '../rules/terms.js';
import type {
  PublicAvailabilityQueryDto,
  PublicAvailableUnitsQueryDto,
  PublicBookingCancelDto,
  PublicBookingPayDto,
  PublicCreateBookingDto,
  PublicQuoteDto,
  PublicVerifyPhoneDto,
} from './public-site.dto.js';
import { LEGAL_DOCS, legalTemplate } from '../rules/legal.js';
import { injectMeta, siteSlugFromHost } from './site-html.js';
import type { WrapperType } from '../../../common/di/wrapper-type.js';

const DAY_MS = 86_400_000;
const DEFAULT_INDEX_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KodiHub</title></head><body><div id="root"></div></body></html>';

export function describePayWhen(r: StayRules): string {
  if (r.payWhen === 'ON_ARRIVAL') {
    return 'Pay on arrival.';
  }
  if (r.payWhen === 'DEPOSIT') {
    const dep =
      r.depositFixed !== null && r.depositFixed !== undefined && r.depositFixed !== ''
        ? `${formatStayKes(r.depositFixed)} deposit now`
        : `${r.depositPercent ?? 50}% deposit now`;
    const bal =
      r.balanceDue === 'BEFORE_CHECKIN'
        ? `balance due ${r.balanceDaysBefore} day${r.balanceDaysBefore === 1 ? '' : 's'} before check-in.`
        : 'balance due on arrival.';
    return `${dep}; ${bal}`;
  }
  return 'Full payment upfront.';
}

@Injectable()
export class PublicSiteService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly rateLimit: RateLimitService,
    private readonly otp: OtpService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
    @Inject(forwardRef(() => StkService))
    private readonly stk: WrapperType<StkService>,
    @Inject(forwardRef(() => DarajaConfigService))
    private readonly darajaConfig: WrapperType<DarajaConfigService>,
    private readonly cipher: FieldCipher,
  ) {}

  private siteRulesFromRow(raw: unknown): StayRules {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_RULES };
    return effectiveRules(DEFAULT_RULES, raw as Partial<StayRules>);
  }

  private async resolveSite(slug: string) {
    const normalized = slug.trim().toLowerCase();
    return withoutOrgScope(async () => {
      const site = await this.prisma.hostSite.findUnique({
        where: { slug: normalized },
        include: {
          organization: { select: { id: true, name: true, status: true, kind: true } },
        },
      });
      if (site) {
        if (
          !site.published ||
          site.organization.kind !== 'HOST' ||
          site.organization.status === 'SUSPENDED'
        ) {
          throw new AppError(404, 'SITE_NOT_FOUND', 'Site not found');
        }
        return { kind: 'site' as const, site };
      }

      const redirected = await this.prisma.hostSite.findFirst({
        where: {
          previousSlug: normalized,
          published: true,
          previousSlugUntil: { gt: new Date() },
        },
        select: { slug: true },
      });
      if (redirected?.slug) {
        return { kind: 'redirect' as const, redirectTo: redirected.slug };
      }

      throw new AppError(404, 'SITE_NOT_FOUND', 'Site not found');
    });
  }

  private async requireSite(slug: string) {
    const res = await this.resolveSite(slug);
    if (res.kind === 'redirect') {
      throw new AppError(404, 'SITE_NOT_FOUND', 'Site not found');
    }
    return res.site;
  }

  async getSite(slug: string) {
    const resolved = await this.resolveSite(slug);
    if (resolved.kind === 'redirect') {
      return { redirectTo: resolved.redirectTo };
    }
    const { site } = resolved;

    return withoutOrgScope(async () => {
      const listings = await this.prisma.listing.findMany({
        where: { orgId: site.orgId, published: true },
        orderBy: { createdAt: 'asc' },
        include: {
          photos: { orderBy: { position: 'asc' }, take: 1 },
        },
      });

      return {
        slug: site.slug,
        businessName: site.businessName || site.organization.name,
        about: site.about,
        logoUrl: site.logoUploadId ? `/api/v1/public/photos/${site.logoUploadId}` : null,
        contactPhone: site.contactPhone,
        whatsappPhone: site.whatsappPhone,
        houseRules: site.houseRules,
        checkInTime: site.checkInTime,
        checkOutTime: site.checkOutTime,
        theme: { preset: site.themePreset, brandColor: site.brandColor },
        legalPages: LEGAL_DOCS.map((d) => ({ key: d.key, title: d.title })),
        listings: listings.map((l) => ({
          id: l.id,
          title: l.title,
          area: l.area,
          coverUrl: l.photos[0] ? `/api/v1/public/photos/${l.photos[0].uploadId}` : null,
          fromPrice: l.nightlyPrice.toString(),
          maxGuests: l.maxGuests,
          bedrooms: l.bedrooms,
          bathrooms: l.bathrooms,
        })),
      };
    });
  }

  async getListing(slug: string, listingId: string) {
    const site = await this.requireSite(slug);
    return withoutOrgScope(async () => {
      const listing = await this.prisma.listing.findFirst({
        where: { id: listingId, orgId: site.orgId, published: true },
        include: {
          photos: { orderBy: { position: 'asc' } },
        },
      });
      if (!listing) {
        throw AppError.notFound('Listing');
      }

      const siteRules = this.siteRulesFromRow(site.rules);
      const rules = effectiveRules(
        siteRules,
        (listing.rulesOverride as unknown as Partial<StayRules> | null) ?? null,
      );

      return {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        area: listing.area,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        maxGuests: listing.maxGuests,
        amenities: listing.amenities,
        nightlyPrice: listing.nightlyPrice.toString(),
        weekendPrice: listing.weekendPrice ? listing.weekendPrice.toString() : null,
        cleaningFee: listing.cleaningFee.toString(),
        weeklyDiscountBps: listing.weeklyDiscountBps,
        minNights: listing.minNights,
        photoUrls: listing.photos.map((p) => `/api/v1/public/photos/${p.uploadId}`),
        photos: listing.photos.map((p) => ({
          id: p.id,
          url: `/api/v1/public/photos/${p.uploadId}`,
          caption: p.caption,
          position: p.position,
        })),
        cancellationText: describeCancellation(rules),
        payWhenText: describePayWhen(rules),
        bookingMode: rules.bookingMode,
      };
    });
  }

  async getAvailability(
    slug: string,
    listingId: string,
    q: PublicAvailabilityQueryDto,
    ip: string,
  ) {
    await this.rateLimit.hit({ key: `pub:avail:ip:${ip}`, limit: 120, windowSeconds: 60 });
    const site = await this.requireSite(slug);

    const fromDate = parseDateOnly(q.from);
    const toDate = parseDateOnly(q.to);
    if (toDate.getTime() <= fromDate.getTime()) {
      throw AppError.fieldInvalid('to', 'End date must be after start date');
    }
    const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS);
    if (spanDays > 366) {
      throw AppError.fieldInvalid('to', 'Availability window cannot exceed 366 days');
    }

    return withoutOrgScope(async () => {
      const listing = await this.prisma.listing.findFirst({
        where: { id: listingId, orgId: site.orgId, published: true },
        select: { id: true, unitId: true },
      });
      if (!listing) {
        throw AppError.notFound('Listing');
      }

      const bookings = await this.prisma.booking.findMany({
        where: {
          orgId: site.orgId,
          unitId: listing.unitId,
          status: { in: [...BLOCKING] },
          checkIn: { lt: toDate },
          checkOut: { gt: fromDate },
        },
        select: { checkIn: true, checkOut: true },
      });

      const unavailableSet = new Set<string>();
      for (const b of bookings) {
        const startMs = Math.max(b.checkIn.getTime(), fromDate.getTime());
        const endMs = Math.min(b.checkOut.getTime(), toDate.getTime());
        for (let t = startMs; t < endMs; t += DAY_MS) {
          unavailableSet.add(formatDateOnly(new Date(t)));
        }
      }

      return { unavailable: [...unavailableSet].sort() };
    });
  }

  async getAvailableListings(slug: string, q: PublicAvailableUnitsQueryDto, ip: string) {
    await this.rateLimit.hit({ key: `pub:avail:ip:${ip}`, limit: 120, windowSeconds: 60 });
    const site = await this.requireSite(slug);

    const checkInDate = parseDateOnly(q.checkIn);
    const checkOutDate = parseDateOnly(q.checkOut);
    if (checkOutDate.getTime() <= checkInDate.getTime()) {
      throw AppError.fieldInvalid('checkOut', 'Check-out must be after check-in');
    }
    const nights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / DAY_MS);

    return withoutOrgScope(async () => {
      const listings = await this.prisma.listing.findMany({
        where: {
          orgId: site.orgId,
          published: true,
          maxGuests: { gte: q.guests },
          minNights: { lte: nights },
        },
        select: { id: true, unitId: true },
      });

      if (listings.length === 0) {
        return { listingIds: [] as string[] };
      }

      const busy = await this.prisma.booking.findMany({
        where: {
          orgId: site.orgId,
          unitId: { in: listings.map((l) => l.unitId) },
          status: { in: [...BLOCKING] },
          checkIn: { lt: checkOutDate },
          checkOut: { gt: checkInDate },
        },
        select: { unitId: true },
      });
      const busyUnitIds = new Set(busy.map((b) => b.unitId));

      return {
        listingIds: listings.filter((l) => !busyUnitIds.has(l.unitId)).map((l) => l.id),
      };
    });
  }

  async quote(slug: string, listingId: string, dto: PublicQuoteDto, ip: string) {
    await this.rateLimit.hit({ key: `pub:avail:ip:${ip}`, limit: 120, windowSeconds: 60 });
    const site = await this.requireSite(slug);

    const listing = await withoutOrgScope(() =>
      this.prisma.listing.findFirst({
        where: { id: listingId, orgId: site.orgId, published: true },
        select: { id: true },
      }),
    );
    if (!listing) {
      throw AppError.notFound('Listing');
    }

    const canPayInApp = (await this.findDarajaChannel(site.orgId)) !== null;
    return runWithContext(emptyContext({ orgId: site.orgId }), async () => {
      const q = await this.bookings.quoteForApi(
        listing.id,
        dto.checkIn,
        dto.checkOut,
        dto.guests,
        site.orgId,
      );
      // The flat shape the guest site reads (frontend/src/site/api.ts PublicQuoteResponse).
      return {
        nights: q.quote.nights,
        lines: q.quote.lines,
        total: q.quote.total,
        dueNow: q.dueNow,
        balanceDueOn: q.balanceDueOn,
        payWhen: q.rules.payWhen,
        payWhenText: describePayWhen(q.rules),
        cancellationText: describeCancellation(q.rules),
        bookingMode: q.rules.bookingMode,
        canPayInApp,
        available: q.available,
        problems: q.problems,
      };
    });
  }

  /** One legal page of a published site: the host's own text, else the starter template. */
  async getLegalPage(slug: string, key: string, ip: string) {
    await this.rateLimit.hit({ key: `pub:avail:ip:${ip}`, limit: 120, windowSeconds: 60 });
    const doc = LEGAL_DOCS.find((d) => d.key === key);
    if (!doc) throw AppError.notFound('Page');
    const site = await this.requireSite(slug);
    const own = site[doc.field];
    const text =
      own ||
      legalTemplate(doc.key, {
        businessName: site.businessName || site.organization.name,
        contactPhone: site.whatsappPhone ?? site.contactPhone,
        siteAddress: site.slug ? `https://${site.slug}.${this.env.SITE_DOMAIN}` : null,
      });
    return {
      key: doc.key,
      title: doc.title,
      text,
      updatedAt: own ? site.updatedAt.toISOString() : null,
    };
  }

  async verifyPhone(slug: string, dto: PublicVerifyPhoneDto, ip: string) {
    const phone = normalizePhone(dto.phone);
    if (!phone) {
      throw AppError.fieldInvalid('phone', 'Enter a valid Kenyan phone number');
    }

    await this.rateLimit.hit(
      { key: `pub:verify:phone:${phone}`, limit: 5, windowSeconds: 10 * 60 },
      { key: `pub:verify:ip:${ip}`, limit: 20, windowSeconds: 3600 },
    );

    const site = await this.requireSite(slug);
    const biz = site.businessName || site.organization.name;
    const code = await this.otp.issue(phone, 'GUEST_BOOKING', null);
    await this.notifications.sendCode(
      { phone },
      'booking',
      code,
      OTP_TTL_MINUTES.GUEST_BOOKING,
      biz,
    );
    return { sent: true };
  }

  private async verifyGuestBookingOtp(phone: string, code: string): Promise<void> {
    try {
      await this.otp.verify(phone, 'GUEST_BOOKING', code.trim());
    } catch (e) {
      if (e instanceof AppError && e.code === 'INVALID_CODE') {
        throw new AppError(422, 'INVALID_CODE', 'That code is wrong or has expired');
      }
      throw e;
    }
  }

  private async findDarajaChannel(orgId: string) {
    return withoutOrgScope(async () => {
      const channels = await this.prisma.paymentChannel.findMany({
        where: {
          orgId,
          kind: { in: ['MPESA_PAYBILL', 'MPESA_TILL'] },
          status: 'ACTIVE',
          darajaEnv: { not: null },
          secretsEnc: { not: null },
        },
        orderBy: { name: 'asc' },
      });
      return (
        channels.find((c) => {
          const creds = this.darajaConfig.credentials(c);
          return !!creds?.passkey && !!c.shortcode && !!c.callbackToken;
        }) ?? null
      );
    });
  }

  async createBooking(slug: string, dto: PublicCreateBookingDto, ip: string) {
    await this.rateLimit.hit({ key: `pub:book:ip:${ip}`, limit: 10, windowSeconds: 3600 });
    const site = await this.requireSite(slug);

    const phone = normalizePhone(dto.phone);
    if (!phone) {
      throw AppError.fieldInvalid('phone', 'Enter a valid Kenyan phone number');
    }

    await this.verifyGuestBookingOtp(phone, dto.code);

    const checkInDate = parseDateOnly(dto.checkIn);
    const checkOutDate = parseDateOnly(dto.checkOut);
    if (checkOutDate.getTime() <= checkInDate.getTime()) {
      throw AppError.fieldInvalid('checkOut', 'Check-out must be after check-in');
    }

    const listing = await withoutOrgScope(() =>
      this.prisma.listing.findFirst({
        where: { id: dto.listingId, orgId: site.orgId, published: true },
        include: { specialPrices: { orderBy: { fromDate: 'asc' } } },
      }),
    );
    if (!listing) {
      throw AppError.notFound('Listing');
    }

    if (dto.guests > listing.maxGuests) {
      throw AppError.fieldInvalid('guests', `Maximum ${listing.maxGuests} guests`);
    }

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

    if (q.nights < listing.minNights) {
      throw AppError.fieldInvalid('checkOut', `Minimum stay is ${listing.minNights} nights`);
    }

    const siteRules = this.siteRulesFromRow(site.rules);
    const rules = effectiveRules(
      siteRules,
      (listing.rulesOverride as unknown as Partial<StayRules> | null) ?? null,
    );
    const due = dueNow(rules, q.total);
    const balOn = balanceDueOn(rules, dto.checkIn);

    const darajaChannel = await this.findDarajaChannel(site.orgId);
    const hasDaraja = darajaChannel !== null;

    const biz = site.businessName || site.organization.name;

    return runWithContext(emptyContext({ orgId: site.orgId }), async () => {
      const now = new Date();
      const created = await this.db.$transaction(async (tx) => {
        const code = await nextCode(tx, site.orgId, 'booking', 'B', 5);
        const guest = await this.bookings.upsertGuest(tx, site.orgId, {
          name: dto.name,
          phone,
          email: dto.email,
        });

        const mode = guest.doNotAccept ? 'REQUEST' : rules.bookingMode;
        let status: BookingStatus;
        let holdExpiresAt: Date | null = null;
        let requestExpiresAt: Date | null = null;

        if (mode === 'REQUEST') {
          status = 'REQUESTED';
          requestExpiresAt = new Date(now.getTime() + 24 * 3600_000);
        } else if (due > 0n) {
          status = 'HELD';
          const holdMs = hasDaraja ? 15 * 60_000 : 2 * 3600_000;
          holdExpiresAt = new Date(now.getTime() + holdMs);
        } else {
          status = 'CONFIRMED';
        }

        const row = await this.bookings.insertBooking(tx, {
          orgId: site.orgId,
          code,
          kind: 'STAY',
          unitId: listing.unitId,
          propertyId: listing.propertyId,
          listingId: listing.id,
          guestId: guest.id,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          guests: dto.guests,
          status,
          source: 'SITE',
          total: q.total,
          dueNow: due,
          balanceDueOn: balOn ? parseDateOnly(balOn) : null,
          lines: q.lines as unknown as Prisma.InputJsonValue,
          rules: rules as unknown as Prisma.InputJsonValue,
          guestNote: dto.note?.trim() ? dto.note.trim() : null,
          holdExpiresAt,
          requestExpiresAt,
        });
        // The link token is derived from the booking id, so it can be rebuilt for later texts.
        await tx.booking.update({
          where: { id: row.id },
          data: { accessTokenHash: hashAccessToken(bookingLinkToken(this.cipher, row.id)) },
        });

        await this.audit.record(
          {
            action: 'booking.site_create',
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
      const link = bookingLinkUrl(
        site.slug ?? slug.trim().toLowerCase(),
        this.env.SITE_DOMAIN,
        bookingLinkToken(this.cipher, created.id),
      );

      if (created.status === 'HELD') {
        if (hasDaraja && due > 0n) {
          await this.stk
            .pushForBooking({
              bookingId: created.id,
              amount: due,
              phone,
            })
            .catch(() => undefined);
        }
        await this.notifications
          .sendSms(
            phone,
            guestSms('HELD', {
              biz,
              unit: listing.title,
              checkIn: dto.checkIn,
              checkOut: dto.checkOut,
              code: created.code,
              amount: due,
              window: hasDaraja ? '15 minutes' : '2 hours',
              link,
            }),
          )
          .catch(() => undefined);
      } else if (created.status === 'CONFIRMED') {
        await this.notifications
          .sendSms(
            phone,
            guestSms('CONFIRMED', {
              biz,
              unit: listing.title,
              checkIn: dto.checkIn,
              checkOut: dto.checkOut,
              code: created.code,
              link,
            }),
          )
          .catch(() => undefined);
        await this.notifications
          .notifyOrgStaff(site.orgId, {
            kind: 'STAY_NEW',
            title: `New booking ${created.code}`,
            body: `${dto.name} at ${listing.title} (${dto.checkIn}–${dto.checkOut})`,
            actionUrl: `/app/bookings/${created.id}`,
          })
          .catch(() => undefined);
        await this.bookings.sendCheckInInfoIfSoon(created.id);
      } else if (created.status === 'REQUESTED') {
        await this.notifications
          .sendSms(
            phone,
            guestSms('REQUESTED', {
              biz,
              unit: listing.title,
              checkIn: dto.checkIn,
              checkOut: dto.checkOut,
              code: created.code,
              link,
            }),
          )
          .catch(() => undefined);
        await this.notifications
          .notifyOrgStaff(site.orgId, {
            kind: 'STAY_REQUEST',
            title: `Booking request ${created.code}`,
            body: `${dto.name} requested ${listing.title} (${dto.checkIn}–${dto.checkOut})`,
            actionUrl: `/app/bookings/${created.id}`,
          })
          .catch(() => undefined);
      }

      return {
        code: created.code,
        status: created.status,
        link,
      };
    });
  }

  private async findBookingByToken(token: string) {
    const clean = token.trim();
    if (!clean) {
      throw AppError.notFound('Booking');
    }
    const accessTokenHash = hashAccessToken(clean);
    const booking = await withoutOrgScope(() =>
      this.prisma.booking.findUnique({
        where: { accessTokenHash },
        include: {
          ...BOOKING_INCLUDE,
          property: {
            select: {
              id: true,
              code: true,
              name: true,
              location: true,
            },
          },
          listing: {
            select: {
              id: true,
              title: true,
              area: true,
              checkInInstructions: true,
            },
          },
        },
      }),
    );
    if (!booking) {
      throw AppError.notFound('Booking');
    }
    return booking;
  }

  async getBookingByToken(token: string, ip: string) {
    await this.rateLimit.hit({ key: `pub:booking:ip:${ip}`, limit: 60, windowSeconds: 60 });
    const booking = await this.findBookingByToken(token);

    return withoutOrgScope(async () => {
      const site = await this.prisma.hostSite.findUnique({
        where: { orgId: booking.orgId },
        include: { organization: { select: { name: true } } },
      });

      const channels = await this.prisma.paymentChannel.findMany({
        where: {
          orgId: booking.orgId,
          kind: { in: ['MPESA_PAYBILL', 'MPESA_TILL'] },
          status: 'ACTIVE',
        },
        orderBy: { name: 'asc' },
      });
      const darajaChannel =
        channels.find((c) => {
          const creds = this.darajaConfig.credentials(c);
          return !!creds?.passkey && !!c.shortcode && !!c.callbackToken;
        }) ?? null;
      const paybillChannel = channels.find((c) => !!c.shortcode) ?? null;

      const rules = effectiveRules(
        DEFAULT_RULES,
        (booking.rules as unknown as Partial<StayRules> | null) ?? null,
      );

      const checkIn = formatDateOnly(booking.checkIn);
      const checkOut = formatDateOnly(booking.checkOut);
      const nights = Math.max(
        1,
        Math.round((booking.checkOut.getTime() - booking.checkIn.getTime()) / DAY_MS),
      );
      const netPaid = booking.amountPaid - booking.amountRefunded;
      const owed = booking.total > netPaid ? booking.total - netPaid : 0n;
      const showArrivalInfo = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';
      const addressText = booking.property.location ?? booking.listing.area ?? null;

      return {
        code: booking.code,
        status: booking.status,
        listing: {
          id: booking.listing.id,
          title: booking.listing.title,
          area: booking.listing.area,
        },
        dates: {
          checkIn,
          checkOut,
          nights,
        },
        guests: booking.guests,
        lines: Array.isArray(booking.lines) ? booking.lines : [],
        total: booking.total.toString(),
        amountPaid: booking.amountPaid.toString(),
        amountRefunded: booking.amountRefunded.toString(),
        owed: owed.toString(),
        dueNow: booking.dueNow.toString(),
        balanceDueOn: booking.balanceDueOn ? formatDateOnly(booking.balanceDueOn) : null,
        payWhenText: describePayWhen(rules),
        cancellationText: describeCancellation(rules),
        holdExpiresAt: booking.holdExpiresAt ? booking.holdExpiresAt.toISOString() : null,
        checkInInstructions: showArrivalInfo ? (booking.listing.checkInInstructions ?? null) : null,
        address: showArrivalInfo ? addressText : null,
        paybill: paybillChannel?.shortcode
          ? { number: paybillChannel.shortcode, accountRef: booking.code }
          : null,
        canPayInApp: darajaChannel !== null,
        contact: {
          businessName: site?.businessName || site?.organization.name || 'Host',
          phone: site?.contactPhone ?? null,
          whatsappPhone: site?.whatsappPhone ?? null,
          checkInTime: site?.checkInTime ?? '14:00',
          checkOutTime: site?.checkOutTime ?? '10:00',
        },
      };
    });
  }

  async payBookingByToken(token: string, dto: PublicBookingPayDto, ip: string) {
    await this.rateLimit.hit({ key: `pub:booking:ip:${ip}`, limit: 60, windowSeconds: 60 });
    const booking = await this.findBookingByToken(token);
    if (!['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status)) {
      throw AppError.conflict('This booking can no longer be paid', 'BOOKING_NOT_PAYABLE');
    }

    const netPaid = booking.amountPaid - booking.amountRefunded;
    const amount =
      booking.status === 'HELD' && booking.dueNow > netPaid
        ? booking.dueNow - netPaid
        : booking.total > netPaid
          ? booking.total - netPaid
          : 0n;

    if (amount <= 0n) {
      throw AppError.conflict('Nothing is owed on this booking', 'NOTHING_OWED');
    }

    const phone = dto.phone?.trim() || booking.guest?.phone || '';

    return runWithContext(emptyContext({ orgId: booking.orgId }), () =>
      this.stk.pushForBooking({
        bookingId: booking.id,
        amount,
        phone,
      }),
    );
  }

  async requestCancelCode(token: string, ip: string) {
    const booking = await this.findBookingByToken(token);
    const phone = booking.guest?.phone;
    if (!phone) {
      throw AppError.notFound('Booking');
    }

    await this.rateLimit.hit(
      { key: `pub:verify:phone:${phone}`, limit: 5, windowSeconds: 10 * 60 },
      { key: `pub:verify:ip:${ip}`, limit: 20, windowSeconds: 3600 },
    );

    const site = await withoutOrgScope(() =>
      this.prisma.hostSite.findUnique({
        where: { orgId: booking.orgId },
        include: { organization: { select: { name: true } } },
      }),
    );
    const biz = site?.businessName || site?.organization.name || 'KodiHub';

    const code = await this.otp.issue(phone, 'GUEST_BOOKING', null);
    await this.notifications.sendCode(
      { phone },
      'booking',
      code,
      OTP_TTL_MINUTES.GUEST_BOOKING,
      biz,
    );
    return { sent: true };
  }

  async cancelBookingByToken(token: string, dto: PublicBookingCancelDto, ip: string) {
    await this.rateLimit.hit({ key: `pub:booking:ip:${ip}`, limit: 60, windowSeconds: 60 });
    const booking = await this.findBookingByToken(token);
    const phone = booking.guest?.phone;
    if (!phone) {
      throw AppError.notFound('Booking');
    }

    await this.verifyGuestBookingOtp(phone, dto.code);

    return runWithContext(emptyContext({ orgId: booking.orgId }), async () => {
      const rules = effectiveRules(
        DEFAULT_RULES,
        (booking.rules as unknown as Partial<StayRules> | null) ?? null,
      );
      const netPaid =
        booking.amountPaid > booking.amountRefunded
          ? booking.amountPaid - booking.amountRefunded
          : 0n;
      const checkInIso = formatDateOnly(booking.checkIn);
      const checkOutIso = formatDateOnly(booking.checkOut);
      const refund = refundFor(rules, netPaid, checkInIso, nairobiToday());

      const updated = await this.bookings.move(booking.id, 'CANCELLED', {
        userId: null,
        actor: 'GUEST',
      });

      const site = await this.db.hostSite.findUnique({
        where: { orgId: booking.orgId },
        select: { businessName: true },
      });
      const biz = site?.businessName ?? 'KodiHub';

      await this.notifications
        .sendSms(
          phone,
          guestSms('CANCELLED', {
            biz,
            unit: updated.listing.title,
            checkIn: checkInIso,
            checkOut: checkOutIso,
            code: updated.code,
            refund,
          }),
        )
        .catch(() => undefined);

      await this.notifications
        .notifyOrgStaff(booking.orgId, {
          kind: 'STAY_CANCELLED',
          title: `Guest cancelled ${updated.code}`,
          body: `${updated.guest?.name ?? 'Guest'} cancelled ${updated.listing.title} (${checkInIso}–${checkOutIso})`,
          actionUrl: `/app/bookings/${updated.id}`,
        })
        .catch(() => undefined);

      return { refund: refund.toString() };
    });
  }

  private cachedIndex: { html: string; expiresAt: number } | null = null;

  private async loadIndexHtml(): Promise<string> {
    const now = Date.now();
    if (this.cachedIndex && this.cachedIndex.expiresAt > now) {
      return this.cachedIndex.html;
    }
    const url = this.env.WEB_INDEX_URL?.trim();
    if (!url) {
      return DEFAULT_INDEX_HTML;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) return DEFAULT_INDEX_HTML;
      const html = await res.text();
      if (!html.trim()) return DEFAULT_INDEX_HTML;
      this.cachedIndex = { html, expiresAt: now + 60_000 };
      return html;
    } catch {
      return DEFAULT_INDEX_HTML;
    }
  }

  async renderSiteHtml(host: string, rawPath: string): Promise<string> {
    const slug = siteSlugFromHost(host ?? '', this.env.SITE_DOMAIN);
    if (!slug) {
      throw AppError.notFound('Site');
    }

    const indexHtml = await this.loadIndexHtml();
    const cleanHost = host.trim().toLowerCase();
    const cleanPath = rawPath?.startsWith('/') ? rawPath : `/${rawPath ?? ''}`;
    const scheme = cleanHost.includes('localhost') ? 'http' : 'https';
    const fullUrl = `${scheme}://${cleanHost}${cleanPath}`;

    try {
      const resolved = await this.resolveSite(slug);
      if (resolved.kind === 'redirect') {
        return indexHtml;
      }
      const { site } = resolved;
      const biz = site.businessName || site.organization.name;

      const unitMatch = /^\/u\/([0-9a-f-]{36})(?:\/|$)/i.exec(cleanPath);
      if (unitMatch) {
        const listing = await withoutOrgScope(() =>
          this.prisma.listing.findFirst({
            where: {
              id: unitMatch[1],
              orgId: site.orgId,
              published: true,
            },
            include: {
              photos: {
                orderBy: { position: 'asc' },
                take: 1,
                select: { uploadId: true },
              },
            },
          }),
        );
        if (listing) {
          const coverId = listing.photos[0]?.uploadId ?? null;
          const desc =
            listing.description?.trim() || site.about?.trim() || `Book ${listing.title} at ${biz}`;
          return injectMeta(indexHtml, {
            title: `${listing.title} · ${biz}`,
            description: desc,
            image: coverId
              ? `${scheme}://${cleanHost}/api/v1/public/photos/${coverId}?w=1024`
              : null,
            url: fullUrl,
          });
        }
      }

      const firstListing = await withoutOrgScope(() =>
        this.prisma.listing.findFirst({
          where: {
            orgId: site.orgId,
            published: true,
          },
          orderBy: { createdAt: 'asc' },
          include: {
            photos: {
              orderBy: { position: 'asc' },
              take: 1,
              select: { uploadId: true },
            },
          },
        }),
      );
      const coverId = firstListing?.photos[0]?.uploadId ?? site.logoUploadId ?? null;
      return injectMeta(indexHtml, {
        title: biz,
        description: site.about?.trim() || `Book directly with ${biz}`,
        image: coverId ? `${scheme}://${cleanHost}/api/v1/public/photos/${coverId}?w=1024` : null,
        url: fullUrl,
      });
    } catch {
      return indexHtml;
    }
  }
}
