import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { currentContext } from '../../../common/context/request-context.js';
import { parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import type {
  PaymentMethod,
  StayPayment,
  StayPaymentKind,
} from '../../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { StkService } from '../../mpesa/stk.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { nextCode } from '../../portfolio/codes.js';
import { propertyScope } from '../../portfolio/property-scope.js';
import { BookingsService, isOverlapConstraintError } from '../bookings/bookings.service.js';
import { GuestNoticesService } from '../notices/guest-notices.service.js';
import { assertHostOrg } from '../host-org.js';
import { parseWholeShillings } from '../listings/listings.service.js';
import { formatStayKes } from '../rules/messages.js';
import type {
  BookingMpesaPromptDto,
  CreateStayPaymentDto,
  CreateStayRefundDto,
  VoidStayPaymentDto,
} from './stay-payments.dto.js';
import type { WrapperType } from '../../../common/di/wrapper-type.js';

export interface RecordStayPaymentInput {
  bookingId: string;
  kind: StayPaymentKind;
  method: PaymentMethod;
  channelId?: string | null;
  amount: bigint;
  reference?: string | null;
  receivedAt: Date;
  inboundId?: string | null;
  recordedById?: string | null;
}

function receiptYear(d: Date): string {
  // Africa/Nairobi is UTC+3 year-round.
  const eat = new Date(d.getTime() + 3 * 3600_000);
  return eat.toISOString().slice(0, 4);
}

function parseReceivedAt(raw?: string): Date {
  if (!raw?.trim()) return new Date();
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return parseDateOnly(s);
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.fieldInvalid('receivedAt', 'Invalid date');
  }
  return parsed;
}

export function viewStayPayment(p: StayPayment) {
  return {
    id: p.id,
    bookingId: p.bookingId,
    number: p.number,
    kind: p.kind,
    method: p.method,
    channelId: p.channelId,
    amount: p.amount.toString(),
    reference: p.reference,
    receivedAt: p.receivedAt.toISOString(),
    inboundId: p.inboundId,
    voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
    voidReason: p.voidReason,
    createdAt: p.createdAt.toISOString(),
  };
}

@Injectable()
export class StayPaymentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => StkService))
    private readonly stk: WrapperType<StkService>,
    private readonly bookings: BookingsService,
    private readonly notices: GuestNoticesService,
  ) {}

  /**
   * The single writer for StayPayment rows. Assigns a yearly receipt number (`SRC-YYYY-NNNNNN`),
   * updates `amountPaid` / `amountRefunded` on the booking, and triggers `afterPayment` on money-in.
   */
  async record(tx: Tx, p: RecordStayPaymentInput): Promise<string> {
    if (p.amount <= 0n) {
      throw AppError.fieldInvalid('amount', 'Amount must be greater than zero');
    }

    const booking = await tx.booking.findUnique({
      where: { id: p.bookingId },
    });
    if (!booking) {
      throw AppError.notFound('Booking');
    }

    if (p.kind === 'REFUND') {
      const netPaid = booking.amountPaid - booking.amountRefunded;
      if (p.amount > netPaid) {
        throw AppError.fieldInvalid('amount', 'Refund cannot exceed the net amount paid');
      }
    }

    const year = receiptYear(p.receivedAt);
    const number = await nextCode(tx, booking.orgId, `stay-receipt-${year}`, `SRC-${year}-`, 6);

    const created = await tx.stayPayment.create({
      data: {
        orgId: booking.orgId,
        bookingId: booking.id,
        number,
        kind: p.kind,
        method: p.method,
        channelId: p.channelId ?? null,
        amount: p.amount,
        reference: p.reference ?? null,
        receivedAt: p.receivedAt,
        inboundId: p.inboundId ?? null,
        recordedById: p.recordedById ?? currentContext()?.userId ?? null,
      },
    });

    if (p.kind === 'PAYMENT') {
      await tx.booking.update({
        where: { id: booking.id },
        data: { amountPaid: { increment: p.amount } },
      });
      await this.afterPayment(tx, booking.id, created.id);
    } else {
      await tx.booking.update({
        where: { id: booking.id },
        data: { amountRefunded: { increment: p.amount } },
      });
    }

    return created.id;
  }

  /**
   * Post-payment status transitions:
   * - HELD with amountPaid >= dueNow -> CONFIRMED
   * - EXPIRED hold (the guest was paying) paid in full -> re-confirm inside a savepoint; if the
   *   dates were taken in the meantime (`bookings_no_overlap`), keep it EXPIRED, note it and
   *   tell staff to refund the guest.
   * - Money on a CANCELLED, DECLINED or other EXPIRED booking (e.g. a request the host never
   *   answered) never brings it back: note it and tell staff to refund the guest.
   */
  async afterPayment(tx: Tx, bookingId: string, paymentId?: string): Promise<void> {
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });

    if (booking.status === 'HELD' && booking.amountPaid >= booking.dueNow) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          holdExpiresAt: null,
        },
      });
      // Which payment confirmed it: the guest is told so with that payment's receipt.
      await this.audit.record(
        {
          orgId: booking.orgId,
          action: 'stay_booking.confirmed_by_payment',
          entity: 'booking',
          entityId: booking.id,
          before: { status: 'HELD' },
          after: { status: 'CONFIRMED', paymentId: paymentId ?? null },
        },
        tx,
      );
      return;
    }

    const refundNeeded = async (note: string, title: string) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { hostNote: note },
      });
      await this.notifications.notifyOrgStaff(booking.orgId, {
        kind: 'STAY_PAYMENT',
        title,
        body: note,
        actionUrl: `/app/bookings/${booking.id}`,
      });
    };

    const expiredHoldPaid =
      booking.status === 'EXPIRED' &&
      booking.holdExpiresAt !== null &&
      booking.amountPaid >= booking.dueNow;

    if (expiredHoldPaid) {
      await tx.$executeRawUnsafe('SAVEPOINT sp_booking_reconfirm');
      try {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CONFIRMED', holdExpiresAt: null },
        });
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT sp_booking_reconfirm');
      } catch (e) {
        await tx
          .$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_booking_reconfirm')
          .catch(() => undefined);
        if (!isOverlapConstraintError(e)) throw e;
        await refundNeeded(
          'Paid after the hold ended and the dates were taken — refund the guest',
          `Late payment on ${booking.code} — refund needed`,
        );
      }
      return;
    }

    const ended: Partial<Record<typeof booking.status, string>> = {
      CANCELLED: 'was cancelled',
      DECLINED: 'was declined',
      EXPIRED: 'expired',
    };
    const what = ended[booking.status];
    if (what) {
      await refundNeeded(
        `Paid after the booking ${what} — refund the guest`,
        `Payment on ${booking.code} after it ${what} — refund needed`,
      );
    }
  }

  async createManual(bookingId: string, dto: CreateStayPaymentDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!booking) {
      throw AppError.notFound('Booking');
    }

    const amount = parseWholeShillings(dto.amount, 'amount');
    const receivedAt = parseReceivedAt(dto.receivedAt);
    const isMpesa = dto.method === 'MPESA_PAYBILL' || dto.method === 'MPESA_TILL';
    const reference = dto.reference?.trim()
      ? isMpesa
        ? dto.reference.trim().toUpperCase()
        : dto.reference.trim()
      : null;

    if (dto.channelId) {
      const ch = await this.db.paymentChannel.findFirst({
        where: { id: dto.channelId, orgId: ctx.orgId },
      });
      if (!ch) throw AppError.notFound('Payment channel');
    }

    const created = await this.db.$transaction(async (tx) => {
      const unmatched =
        isMpesa && reference
          ? await tx.inboundTransaction.findFirst({
              where: {
                orgId: ctx.orgId,
                ...(dto.channelId ? { channelId: dto.channelId } : {}),
                providerRef: reference,
                matchStatus: 'UNMATCHED',
              },
            })
          : null;

      const paymentId = await this.record(tx, {
        bookingId: booking.id,
        kind: 'PAYMENT',
        method: dto.method,
        channelId: dto.channelId ?? unmatched?.channelId ?? null,
        amount,
        reference,
        receivedAt,
        inboundId: unmatched?.id ?? null,
        recordedById: ctx.userId,
      });

      if (unmatched) {
        await tx.inboundTransaction.update({
          where: { id: unmatched.id },
          data: {
            matchStatus: 'MATCHED',
            matchedBy: 'MANUAL',
            bookingId: booking.id,
            stayPaymentId: paymentId,
            resolvedById: ctx.userId,
            resolvedAt: new Date(),
          },
        });
      }

      const row = await tx.stayPayment.findUniqueOrThrow({ where: { id: paymentId } });

      await this.audit.record(
        {
          action: 'stay_payment.create',
          entity: 'stay_payment',
          entityId: row.id,
          after: {
            bookingId: booking.id,
            number: row.number,
            method: row.method,
            amount: row.amount.toString(),
            reference: row.reference,
          },
        },
        tx,
      );

      return row;
    });

    await this.notifyPayment(created.id);
    return viewStayPayment(created);
  }

  /**
   * Sends the post-commit PAYMENT SMS to the guest and STAY_PAYMENT notification to staff.
   */
  async notifyPayment(paymentId: string): Promise<void> {
    const payment = await this.db.stayPayment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            guest: true,
            listing: { select: { title: true } },
          },
        },
      },
    });
    if (!payment || payment.kind !== 'PAYMENT') return;

    const booking = payment.booking;
    const confirmedBy = await this.db.auditLog.findFirst({
      where: { action: 'stay_booking.confirmed_by_payment', entityId: booking.id },
      orderBy: { createdAt: 'desc' },
      select: { after: true },
    });
    const confirmed =
      (confirmedBy?.after as { paymentId?: string | null } | null)?.paymentId === payment.id;
    await this.notices.tell('PAYMENT', booking.id, {
      amount: payment.amount,
      paymentId: payment.id,
      confirmed,
    });

    await this.notifications.notifyOrgStaff(booking.orgId, {
      kind: 'STAY_PAYMENT',
      title: `Payment received for ${booking.code}`,
      body: `${formatStayKes(payment.amount)} received for ${booking.listing.title}`,
      actionUrl: `/app/bookings/${booking.id}`,
      excludeUserId: payment.recordedById,
    });

    await this.bookings.sendCheckInInfoIfSoon(booking.id);
  }

  async createRefund(bookingId: string, dto: CreateStayRefundDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!booking) {
      throw AppError.notFound('Booking');
    }

    const amount = parseWholeShillings(dto.amount, 'amount');
    const receivedAt = parseReceivedAt(dto.receivedAt);
    const reference = dto.reference?.trim() || dto.note?.trim() || null;

    const created = await this.db.$transaction(async (tx) => {
      const paymentId = await this.record(tx, {
        bookingId: booking.id,
        kind: 'REFUND',
        method: dto.method,
        channelId: dto.channelId ?? null,
        amount,
        reference,
        receivedAt,
        recordedById: ctx.userId,
      });

      const row = await tx.stayPayment.findUniqueOrThrow({ where: { id: paymentId } });

      await this.audit.record(
        {
          action: 'stay_payment.refund',
          entity: 'stay_payment',
          entityId: row.id,
          after: {
            bookingId: booking.id,
            number: row.number,
            method: row.method,
            amount: row.amount.toString(),
            reference: row.reference,
          },
        },
        tx,
      );

      return row;
    });

    return viewStayPayment(created);
  }

  async voidPayment(bookingId: string, paymentId: string, dto: VoidStayPaymentDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, orgId: ctx.orgId, property: propertyScope() },
    });
    if (!booking) {
      throw AppError.notFound('Booking');
    }

    const updated = await this.db.$transaction(async (tx) => {
      const existing = await tx.stayPayment.findFirst({
        where: { id: paymentId, bookingId: booking.id, orgId: ctx.orgId },
      });
      if (!existing) {
        throw AppError.notFound('Payment');
      }
      if (existing.voidedAt !== null) {
        throw AppError.conflict('This payment has already been voided', 'ALREADY_VOIDED');
      }

      const row = await tx.stayPayment.update({
        where: { id: existing.id },
        data: {
          voidedAt: new Date(),
          voidReason: dto.reason?.trim() ? dto.reason.trim() : null,
          inboundId: null,
        },
      });

      if (existing.kind === 'PAYMENT') {
        await tx.booking.update({
          where: { id: booking.id },
          data: { amountPaid: { decrement: existing.amount } },
        });
      } else {
        await tx.booking.update({
          where: { id: booking.id },
          data: { amountRefunded: { decrement: existing.amount } },
        });
      }

      if (existing.inboundId) {
        await tx.inboundTransaction.updateMany({
          where: { id: existing.inboundId, orgId: ctx.orgId },
          data: {
            matchStatus: 'UNMATCHED',
            matchedBy: null,
            bookingId: null,
            stayPaymentId: null,
            resolvedById: null,
            resolvedAt: null,
          },
        });
      }

      await this.audit.record(
        {
          action: 'stay_payment.void',
          entity: 'stay_payment',
          entityId: row.id,
          after: {
            bookingId: booking.id,
            number: row.number,
            voidReason: row.voidReason,
          },
        },
        tx,
      );

      return row;
    });

    return viewStayPayment(updated);
  }

  async promptMpesa(bookingId: string, dto: BookingMpesaPromptDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);

    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, orgId: ctx.orgId, property: propertyScope() },
      include: { guest: true },
    });
    if (!booking) {
      throw AppError.notFound('Booking');
    }

    const netPaid = booking.amountPaid - booking.amountRefunded;
    const defaultAmount =
      booking.status === 'HELD' && booking.dueNow > netPaid
        ? booking.dueNow - netPaid
        : booking.total - netPaid;

    const amount =
      dto.amount !== undefined && dto.amount !== null && dto.amount !== ''
        ? parseWholeShillings(dto.amount, 'amount')
        : defaultAmount;

    const phone = dto.phone?.trim() || booking.guest?.phone || '';

    return this.stk.pushForBooking({
      bookingId: booking.id,
      amount,
      phone,
    });
  }
}
