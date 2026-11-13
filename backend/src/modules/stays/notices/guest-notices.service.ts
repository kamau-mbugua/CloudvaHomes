import { Inject, Injectable, Logger } from '@nestjs/common';
import { withoutOrgScope } from '../../../common/context/request-context.js';
import { FieldCipher } from '../../../common/crypto/field-cipher.js';
import { formatDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { smsKes } from '../../../common/money/money.js';
import {
  readOrgDocumentInstructions,
  readSystemDocumentInstructions,
} from '../../../common/pdf/pdf.js';
import type { StayPayment } from '../../../generated/prisma/client.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import type { GuestEmailTemplateKey } from '../../notifications/guest-email-templates.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { ReceiptLinksService } from '../../notifications/receipt-links.service.js';
import { ShortLinksService } from '../../notifications/short-links.service.js';
import type { EmailAttachment } from '../../notifications/senders.js';
import { bookingLinkToken, bookingLinkUrl, hashAccessToken } from '../bookings/booking-link.js';
import { renderStayReceiptPdf, STAY_METHOD_LABEL } from '../payments/stay-receipt-pdf.js';
import { owedOn } from '../rules/balance.js';
import { locationOf, mapLink, shortMapLink } from '../rules/location.js';
import {
  guestSms,
  stayReceiptSms,
  type GuestSmsData,
  type GuestSmsEvent,
} from '../rules/messages.js';

/** What a call site knows that the booking row doesn't (the rest is read from the booking). */
export interface GuestNoticeExtra {
  /** HELD / PAY_NOW: the amount to pay now; PAYMENT: the amount received. */
  amount?: bigint;
  /** CANCELLED: the refund due. */
  refund?: bigint;
  /** HELD: how long the place is held, in words. */
  window?: string;
  /** PAYMENT: the payment this is about (its receipt is attached). */
  paymentId?: string;
  /** PAYMENT: this payment confirmed the booking. */
  confirmed?: boolean;
  /**
   * PAYMENT: a host re-sending this one receipt; the SMS carries the receipt's link and only
   * this receipt is attached to the email.
   */
  receiptOnly?: boolean;
}

/** What actually went out. */
export interface GuestNoticeResult {
  sms: boolean;
  email: boolean;
}

const TEMPLATE: Record<GuestSmsEvent, GuestEmailTemplateKey> = {
  REQUESTED: 'guest_booking_requested',
  HELD: 'guest_booking_held',
  PAY_NOW: 'guest_booking_accepted',
  CONFIRMED: 'guest_booking_confirmed',
  PAYMENT: 'guest_payment_received',
  BALANCE_DUE: 'guest_balance_due',
  CHECKIN_INFO: 'guest_checkin_info',
  DECLINED: 'guest_booking_declined',
  EXPIRED: 'guest_booking_expired',
  CANCELLED: 'guest_booking_cancelled',
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 13 Nov 2026" for a date-only value. */
export function longStayDate(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Fri 13 Nov 2026, 13:18" in Nairobi time. */
function nairobiDateTime(at: Date): string {
  const n = new Date(at.getTime() + 3 * 3600_000);
  const hh = String(n.getUTCHours()).padStart(2, '0');
  const mm = String(n.getUTCMinutes()).padStart(2, '0');
  return `${longStayDate(n)}, ${hh}:${mm}`;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Everything a short-stay guest is told about a booking: the SMS and, when the guest gave an
 * email, the matching email from the host (receipt PDFs attached to payment and confirmation
 * emails). Never throws: a failed message is logged and the booking goes on.
 */
@Injectable()
export class GuestNoticesService {
  private readonly log = new Logger(GuestNoticesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notifications: NotificationsService,
    private readonly shortLinks: ShortLinksService,
    private readonly receiptLinks: ReceiptLinksService,
    private readonly cipher: FieldCipher,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * The guest's booking-page link, for bookings made on the host's site (they carry a link
   * token). Empty for host-made bookings, which have no guest page.
   */
  async guestLink(booking: { id: string; orgId: string }): Promise<string> {
    const row = await withoutOrgScope(() =>
      this.db.booking.findUnique({ where: { id: booking.id }, select: { accessTokenHash: true } }),
    );
    const token = bookingLinkToken(this.cipher, booking.id);
    if (!row?.accessTokenHash || row.accessTokenHash !== hashAccessToken(token)) return '';
    const site = await withoutOrgScope(() =>
      this.db.hostSite.findUnique({ where: { orgId: booking.orgId }, select: { slug: true } }),
    );
    return site?.slug ? bookingLinkUrl(site.slug, this.env.SITE_DOMAIN, token) : '';
  }

  async tell(event: GuestSmsEvent, bookingId: string, extra: GuestNoticeExtra = {}): Promise<void> {
    try {
      await this.send(event, bookingId, extra);
    } catch (err) {
      this.log.warn({ err, bookingId, event }, 'Guest notice failed');
    }
  }

  /**
   * A host re-sending one stay receipt: SMS with the receipt's link, and (when the guest gave an
   * email) the receipt email with the PDF. Says what went out; never throws for a failed message.
   */
  async sendReceipt(paymentId: string): Promise<GuestNoticeResult> {
    const p = await withoutOrgScope(() =>
      this.db.stayPayment.findUnique({ where: { id: paymentId } }),
    );
    if (!p || p.kind !== 'PAYMENT' || p.voidedAt) throw AppError.notFound('Receipt');
    return this.send('PAYMENT', p.bookingId, {
      paymentId: p.id,
      amount: p.amount,
      receiptOnly: true,
    });
  }

  /** The receipt PDF for one stay payment (callers check the caller may see it). */
  async receiptPdf(
    paymentId: string,
  ): Promise<{ number: string; filename: string; content: Buffer }> {
    const p = await withoutOrgScope(() =>
      this.db.stayPayment.findUnique({
        where: { id: paymentId },
        include: { booking: { include: { guest: true, listing: { select: { title: true } } } } },
      }),
    );
    if (!p || p.kind !== 'PAYMENT' || p.voidedAt) throw AppError.notFound('Receipt');
    const b = p.booking;
    const [site, org, payments] = await withoutOrgScope(() =>
      Promise.all([
        this.db.hostSite.findUnique({ where: { orgId: b.orgId } }),
        this.db.organization.findUniqueOrThrow({
          where: { id: b.orgId },
          select: { name: true, phone: true, email: true, kraPin: true, settings: true },
        }),
        this.db.stayPayment.findMany({
          where: { bookingId: b.id, kind: 'PAYMENT', voidedAt: null },
          orderBy: { receivedAt: 'asc' },
        }),
      ]),
    );
    const content = await this.renderReceipt({
      payment: p,
      payments,
      booking: b,
      guest: { name: b.guest?.name ?? 'Guest', phone: b.guest?.phone ?? '' },
      listingTitle: b.listing.title,
      biz: site?.businessName || org.name,
      phone: site?.contactPhone ?? org.phone,
      org,
    });
    return { number: p.number, filename: `${p.number}.pdf`, content };
  }

  /** One receipt PDF: what was paid up to and including this payment, and what was left. */
  private async renderReceipt(r: {
    payment: StayPayment;
    payments: StayPayment[];
    booking: { code: string; checkIn: Date; checkOut: Date; total: bigint };
    guest: { name: string; phone: string };
    listingTitle: string;
    biz: string;
    phone: string | null;
    org: { email: string | null; kraPin: string | null; settings: unknown };
  }): Promise<Buffer> {
    const settings = await withoutOrgScope(() =>
      this.db.platformSettings.findUnique({ where: { id: 1 }, select: { emailTemplates: true } }),
    );
    const p = r.payment;
    const b = r.booking;
    const paidUpTo = r.payments
      .filter((q) => q.receivedAt.getTime() <= p.receivedAt.getTime())
      .reduce((n, q) => n + q.amount, 0n);
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / DAY_MS));
    return renderStayReceiptPdf({
      org: { name: r.biz, phone: r.phone ?? '', email: r.org.email ?? '', kraPin: r.org.kraPin },
      payment: {
        number: p.number,
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        receivedAt: nairobiDateTime(p.receivedAt),
      },
      guest: r.guest,
      booking: {
        code: b.code,
        listingTitle: r.listingTitle,
        checkIn: longStayDate(b.checkIn),
        checkOut: longStayDate(b.checkOut),
        nights,
        total: b.total,
        paid: paidUpTo,
        owed: b.total > paidUpTo ? b.total - paidUpTo : 0n,
      },
      instructions: {
        org: readOrgDocumentInstructions(r.org.settings).receiptInstructions,
        system: readSystemDocumentInstructions(settings?.emailTemplates).receiptInstructions,
      },
    });
  }

  private async send(
    event: GuestSmsEvent,
    bookingId: string,
    extra: GuestNoticeExtra,
  ): Promise<GuestNoticeResult> {
    const b = await withoutOrgScope(() =>
      this.db.booking.findUnique({
        where: { id: bookingId },
        include: {
          guest: true,
          listing: {
            select: {
              title: true,
              checkInInstructions: true,
              address: true,
              lat: true,
              lng: true,
              placeId: true,
            },
          },
        },
      }),
    );
    if (!b?.guest) return { sms: false, email: false };
    const [site, org] = await withoutOrgScope(() =>
      Promise.all([
        this.db.hostSite.findUnique({ where: { orgId: b.orgId } }),
        this.db.organization.findUniqueOrThrow({
          where: { id: b.orgId },
          select: { name: true, phone: true, email: true, kraPin: true, settings: true },
        }),
      ]),
    );
    const biz = site?.businessName || org.name;
    const link = await this.guestLink(b);
    const location = locationOf(b.listing);
    const paid = b.amountPaid - b.amountRefunded;
    const owed = owedOn(b);
    const checkIn = formatDateOnly(b.checkIn);
    const checkOut = formatDateOnly(b.checkOut);
    const checkInTime = site?.checkInTime ?? '14:00';
    const checkOutTime = site?.checkOutTime ?? '10:00';
    const instructions = b.listing.checkInInstructions?.trim() ?? '';

    let sms = false;
    if (b.guest.phone) {
      // SMS carry short links (go.kodihub.co.ke/…) so they stay within one unit; emails keep
      // the full ones.
      const short = (url: string, kind: 'booking' | 'map') =>
        this.shortLinks.shortenOrKeep(url, { kind, orgId: b.orgId });
      const data: GuestSmsData = {
        biz,
        unit: b.listing.title,
        checkIn,
        checkOut,
        code: b.code,
        link: link ? await short(link, 'booking') : '',
        amount: extra.amount ?? b.dueNow,
        due: owed,
        refund: extra.refund ?? 0n,
        window: extra.window,
        time: checkInTime,
        instructions,
        mapLink: location ? await short(shortMapLink(location), 'map') : '',
        confirmed: extra.confirmed,
      };
      const receipt =
        extra.receiptOnly && extra.paymentId
          ? await withoutOrgScope(() =>
              this.db.stayPayment.findUnique({ where: { id: extra.paymentId } }),
            )
          : null;
      const text = receipt
        ? stayReceiptSms({
            biz,
            number: receipt.number,
            amount: receipt.amount,
            code: b.code,
            link: await this.receiptLinks.shortUrl('stay', receipt.id, b.orgId),
          })
        : guestSms(event, data);
      sms = await this.notifications
        .sendSms(
          { kind: 'org', orgId: b.orgId, type: event === 'PAYMENT' ? 'stay_payment' : 'booking' },
          b.guest.phone,
          text,
        )
        .then(() => true)
        .catch(() => false);
    }

    if (!b.guest.email) return { sms, email: false };

    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / DAY_MS));
    const phone = site?.contactPhone ?? org.phone;
    const whatsapp = site?.whatsappPhone;
    const hostContactLine = phone
      ? `Questions? Call ${biz} on ${phone}${whatsapp && whatsapp !== phone ? ` or WhatsApp ${whatsapp}` : ''}.`
      : org.email
        ? `Questions? Reply to this email to reach ${biz}.`
        : '';
    const summary = [
      `Booking: ${b.code}`,
      `Place: ${b.listing.title}`,
      ...(location ? [`Address: ${location.address}`, `Map: ${mapLink(location)}`] : []),
      `Check-in: ${longStayDate(b.checkIn)} from ${checkInTime}`,
      `Check-out: ${longStayDate(b.checkOut)} by ${checkOutTime}`,
      `Nights: ${nights}`,
      `Guests: ${b.guests}`,
      `Total: ${smsKes(b.total)}`,
      `Paid: ${smsKes(paid)}`,
      owed > 0n
        ? `Still to pay: ${smsKes(owed)}`
        : b.amountWrittenOff > 0n
          ? 'Still to pay: nothing'
          : 'Still to pay: nothing, fully paid',
    ].join('\n');
    const amount = smsKes(extra.amount ?? b.dueNow);

    const vars: Record<string, string> = {
      guestName: b.guest.name.split(/\s+/)[0] ?? b.guest.name,
      businessName: biz,
      bookingCode: b.code,
      listingTitle: b.listing.title,
      checkInDate: longStayDate(b.checkIn),
      checkOutDate: longStayDate(b.checkOut),
      bookingSummary: summary,
      bookingLinkLine: link ? `Your booking page: ${link}` : '',
      hostContactLine,
      amount,
      window: extra.window ?? '',
      refund: smsKes(extra.refund ?? 0n),
      payLines: await this.payLines(b.orgId, b.code, link),
      gettingThere: [
        ...(location ? [`Address: ${location.address}`, `Map: ${mapLink(location)}`] : []),
        `Check-in: from ${checkInTime} on ${longStayDate(b.checkIn)}`,
        ...(instructions ? [`Instructions: ${instructions}`] : []),
      ].join('\n'),
      receiptsLine: '',
      statusLine: '',
      receiptNumber: '',
      paymentMethod: '',
      receivedAt: '',
    };

    let attachments: EmailAttachment[] = [];
    if (event === 'PAYMENT' || event === 'CONFIRMED') {
      const payments = await withoutOrgScope(() =>
        this.db.stayPayment.findMany({
          where: { bookingId: b.id, kind: 'PAYMENT', voidedAt: null },
          orderBy: { receivedAt: 'asc' },
        }),
      );
      const current = payments.find((p) => p.id === extra.paymentId);
      if (event === 'PAYMENT' && current) {
        vars.receiptNumber = current.number;
        vars.paymentMethod = STAY_METHOD_LABEL[current.method] ?? current.method;
        vars.receivedAt = nairobiDateTime(current.receivedAt);
        vars.amount = smsKes(current.amount);
        vars.statusLine =
          owed === 0n
            ? 'Your booking is fully paid.'
            : `${extra.confirmed ? 'Your stay is confirmed. ' : ''}Still to pay: ${smsKes(owed)}.`;
      }
      // One receipt per payment email; every receipt once fully paid, and on confirmation.
      const attach =
        event === 'PAYMENT' && (owed > 0n || extra.receiptOnly)
          ? payments.filter((p) => p.id === extra.paymentId)
          : payments;
      if (attach.length) {
        const guest = { name: b.guest.name, phone: b.guest.phone };
        attachments = await Promise.all(
          attach.map(async (p) => ({
            filename: `${p.number}.pdf`,
            contentType: 'application/pdf',
            content: await this.renderReceipt({
              payment: p,
              payments,
              booking: b,
              guest,
              listingTitle: b.listing.title,
              biz,
              phone,
              org,
            }),
          })),
        );
        const numbers = attach.map((p) => p.number);
        vars.receiptsLine =
          numbers.length === 1
            ? `Your receipt ${numbers[0]} is attached.`
            : `Your receipts ${listOf(numbers)} are attached.`;
      }
    }

    try {
      await this.notifications.sendGuestEmail({
        to: b.guest.email,
        template: TEMPLATE[event],
        vars,
        hostName: biz,
        hostEmail: org.email,
        attachments,
      });
      return { sms, email: true };
    } catch (err) {
      this.log.warn({ err, bookingId, event }, 'Guest email failed');
      return { sms, email: false };
    }
  }

  /** How to pay: the booking page, and the host's M-Pesa paybill or till when it has one. */
  private async payLines(orgId: string, code: string, link: string): Promise<string> {
    const channel = await withoutOrgScope(() =>
      this.db.paymentChannel.findFirst({
        where: {
          orgId,
          kind: { in: ['MPESA_PAYBILL', 'MPESA_TILL'] },
          status: 'ACTIVE',
          shortcode: { not: null },
        },
        orderBy: { name: 'asc' },
      }),
    );
    return [
      ...(link ? [`Pay on your booking page: ${link}`] : []),
      ...(channel?.shortcode
        ? [
            channel.kind === 'MPESA_PAYBILL'
              ? `M-Pesa paybill: ${channel.shortcode}, account ${code}`
              : `M-Pesa till: ${channel.shortcode}`,
          ]
        : []),
    ].join('\n');
  }
}
