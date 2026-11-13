import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type {
  InboundSource,
  MatchMethod,
  PaymentChannel,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { PaymentsService } from '../payments/payments.service.js';
import { tenantScope } from '../portfolio/property-scope.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { StayPaymentsService } from '../stays/payments/stay-payments.service.js';
import { normalizeAccountRef } from './daraja.js';
import { owedOn } from '../stays/rules/balance.js';
import { guessesFor, unitSplits } from './matching.js';
import type { AssignInboundDto, IgnoreInboundDto, ListInboundQueryDto } from './mpesa.dto.js';
import type { WrapperType } from '../../common/di/wrapper-type.js';

export interface InboundInput {
  source: InboundSource;
  providerRef: string;
  amount: bigint;
  payerName: string | null;
  payerPhone: string | null;
  accountRef: string | null;
  occurredAt: Date;
  raw: Prisma.InputJsonValue;
}

const TENANT = { select: { id: true, code: true, firstName: true, lastName: true } } as const;

const BOOKING = {
  select: {
    id: true,
    code: true,
    status: true,
    checkIn: true,
    checkOut: true,
    total: true,
    amountPaid: true,
    amountRefunded: true,
    amountWrittenOff: true,
    guest: { select: { name: true, phone: true } },
  },
} as const;

/** A booking as Reconciliation shows it: who, when, and what is still owed (cents). */
function bookingView(b: {
  id: string;
  code: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
  total: bigint;
  amountPaid: bigint;
  amountRefunded: bigint;
  amountWrittenOff: bigint;
  guest: { name: string; phone: string } | null;
}) {
  const owed = owedOn(b);
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    guestName: b.guest?.name ?? null,
    checkIn: formatDateOnly(b.checkIn),
    checkOut: formatDateOnly(b.checkOut),
    total: b.total.toString(),
    owed: owed.toString(),
  };
}

/**
 * Raw M-Pesa money-in: stored once (unique per channel + receipt), then matched to a tenant
 * and turned into a payment — or left for a person on the reconciliation screen.
 * Webhook paths call `receive` inside a context whose orgId is the channel's organisation.
 */
@Injectable()
export class InboundService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly tenants: TenantsService,
    @Inject(forwardRef(() => StayPaymentsService))
    private readonly stayPayments: WrapperType<StayPaymentsService>,
  ) {}

  /**
   * Stores and processes one transaction. Idempotent: a replay of a receipt already stored
   * returns the stored one untouched. `target` = the STK request it answers (tenant or booking).
   */
  async receive(
    channel: PaymentChannel,
    input: InboundInput,
    target?: { tenantId: string; invoiceIds: string[] } | { bookingId: string },
  ): Promise<{ inboundId: string; paymentId: string | null; replay: boolean }> {
    const existing = await this.db.inboundTransaction.findUnique({
      where: { channelId_providerRef: { channelId: channel.id, providerRef: input.providerRef } },
    });
    if (existing) {
      return {
        inboundId: existing.id,
        paymentId: existing.paymentId ?? existing.stayPaymentId,
        replay: true,
      };
    }

    let result: { inboundId: string; paymentId: string | null; isStay?: boolean };
    try {
      result = await this.db.$transaction(async (tx) => {
        const inbound = await tx.inboundTransaction.create({
          data: { orgId: channel.orgId, channelId: channel.id, ...input },
        });
        // Entered by hand already for a stay? Link to it instead of paying twice.
        const manualStay = await tx.stayPayment.findFirst({
          where: {
            channelId: channel.id,
            reference: input.providerRef.toUpperCase(),
            kind: 'PAYMENT',
            voidedAt: null,
          },
        });
        if (manualStay) {
          await tx.inboundTransaction.update({
            where: { id: inbound.id },
            data: {
              matchStatus: 'MATCHED',
              matchedBy: 'EXISTING',
              bookingId: manualStay.bookingId,
              stayPaymentId: manualStay.id,
              resolvedAt: new Date(),
            },
          });
          if (!manualStay.inboundId) {
            await tx.stayPayment.update({
              where: { id: manualStay.id },
              data: { inboundId: inbound.id },
            });
          }
          return { inboundId: inbound.id, paymentId: null, isStay: true };
        }
        // Entered by hand already for a tenant? Link to it instead of paying twice.
        const manual = await tx.payment.findFirst({
          where: {
            channelId: channel.id,
            reference: input.providerRef.toUpperCase(),
            amount: { gt: 0n },
          },
        });
        if (manual) {
          await this.resolve(tx, inbound.id, {
            matchedBy: 'EXISTING',
            tenantId: manual.tenantId,
            paymentId: manual.id,
          });
          if (!manual.inboundId) {
            await tx.payment.update({ where: { id: manual.id }, data: { inboundId: inbound.id } });
          }
          return { inboundId: inbound.id, paymentId: null };
        }
        const match = target
          ? 'bookingId' in target
            ? { kind: 'booking' as const, bookingId: target.bookingId, by: 'AUTO_STK' as const }
            : {
                kind: 'tenant' as const,
                tenantId: target.tenantId,
                by: 'AUTO_STK' as const,
                invoiceIds: target.invoiceIds,
              }
          : await this.match(tx, channel.orgId, input);
        if (!match) return { inboundId: inbound.id, paymentId: null };

        if (match.kind === 'booking') {
          const stayPaymentId = await this.stayPayments.record(tx, {
            bookingId: match.bookingId,
            kind: 'PAYMENT',
            method: channel.kind as PaymentMethod,
            channelId: channel.id,
            amount: input.amount,
            reference: input.providerRef,
            receivedAt: input.occurredAt,
            inboundId: inbound.id,
          });
          await tx.inboundTransaction.update({
            where: { id: inbound.id },
            data: {
              matchStatus: 'MATCHED',
              matchedBy: match.by,
              bookingId: match.bookingId,
              stayPaymentId,
              resolvedAt: new Date(),
            },
          });
          return { inboundId: inbound.id, paymentId: stayPaymentId, isStay: true };
        }

        const paymentId = await this.payments.recordAutomatic(tx, {
          orgId: channel.orgId,
          tenantId: match.tenantId,
          channel,
          amount: input.amount,
          reference: input.providerRef,
          receivedAt: input.occurredAt,
          paidBy: input.payerName,
          inboundId: inbound.id,
          preferInvoiceIds: match.invoiceIds,
        });
        await this.resolve(tx, inbound.id, {
          matchedBy: match.by,
          tenantId: match.tenantId,
          paymentId,
        });
        return { inboundId: inbound.id, paymentId };
      });
    } catch (e) {
      // A concurrent retry of the same callback stored it first.
      if (violatesUnique(e, 'providerRef')) {
        const row = await this.db.inboundTransaction.findUniqueOrThrow({
          where: {
            channelId_providerRef: { channelId: channel.id, providerRef: input.providerRef },
          },
        });
        return {
          inboundId: row.id,
          paymentId: row.paymentId ?? row.stayPaymentId,
          replay: true,
        };
      }
      throw e;
    }
    if (result.paymentId && !result.isStay) await this.payments.notifyReceipt(result.paymentId);
    if (result.paymentId && result.isStay) await this.stayPayments.notifyPayment(result.paymentId);
    return { inboundId: result.inboundId, paymentId: result.paymentId, replay: false };
  }

  /** Match for an unmatched transaction: booking code (HOST orgs), tenant/invoice/unit, then phone. */
  private async match(
    tx: Tx,
    orgId: string,
    input: InboundInput,
  ): Promise<
    | { kind: 'booking'; bookingId: string; by: MatchMethod }
    | { kind: 'tenant'; tenantId: string; by: MatchMethod; invoiceIds?: string[] }
    | null
  > {
    for (const g of guessesFor(input.accountRef)) {
      if (g.kind === 'booking') {
        const org = await tx.organization.findUnique({
          where: { id: orgId },
          select: { kind: true },
        });
        if (org?.kind === 'HOST') {
          const b = await tx.booking.findFirst({
            where: { orgId, code: g.code, kind: 'STAY' },
            select: { id: true },
          });
          if (b) return { kind: 'booking', bookingId: b.id, by: 'AUTO_ACCOUNT' };
        }
      } else if (g.kind === 'tenant') {
        const t = await tx.tenant.findFirst({ where: { code: g.code }, select: { id: true } });
        if (t) return { kind: 'tenant', tenantId: t.id, by: 'AUTO_ACCOUNT' };
      } else if (g.kind === 'invoice') {
        const i = await tx.invoice.findFirst({
          where: { number: g.number, status: { not: 'VOID' } },
          select: { id: true, tenantId: true },
        });
        if (i)
          return { kind: 'tenant', tenantId: i.tenantId, by: 'AUTO_ACCOUNT', invoiceIds: [i.id] };
      } else {
        const props = await tx.property.findMany({ select: { id: true, code: true } });
        for (const split of unitSplits(
          g.ref,
          props.map((p) => p.code),
        )) {
          const propertyId = props.find((p) => p.code === split.code)!.id;
          const units = await tx.unit.findMany({
            where: { propertyId },
            select: {
              number: true,
              tenancies: {
                where: { status: { in: ['ACTIVE', 'NOTICE'] } },
                select: { tenantId: true },
              },
            },
          });
          const unit = units.find((u) => normalizeAccountRef(u.number) === split.number);
          const tenantId = unit?.tenancies[0]?.tenantId;
          if (tenantId) return { kind: 'tenant', tenantId, by: 'AUTO_ACCOUNT' };
        }
      }
    }
    if (input.payerPhone) {
      const byPhone = await tx.tenant.findMany({
        where: { phone: input.payerPhone },
        select: { id: true },
        take: 2,
      });
      if (byPhone.length === 1)
        return { kind: 'tenant', tenantId: byPhone[0]!.id, by: 'AUTO_PHONE' };
    }
    return null;
  }

  private async resolve(
    tx: Tx,
    id: string,
    r: { matchedBy: MatchMethod; tenantId: string; paymentId: string },
  ) {
    const ctx = currentContext();
    await tx.inboundTransaction.update({
      where: { id },
      data: {
        matchStatus: 'MATCHED',
        matchedBy: r.matchedBy,
        tenantId: r.tenantId,
        paymentId: r.paymentId,
        resolvedById: r.matchedBy === 'MANUAL' ? (ctx?.userId ?? null) : null,
        resolvedAt: new Date(),
      },
    });
  }

  // ── Reconciliation screen ──

  private async view(rows: Prisma.InboundTransactionGetPayload<{ include: { channel: true } }>[]) {
    const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((x): x is string => !!x))];
    const paymentIds = [...new Set(rows.map((r) => r.paymentId).filter((x): x is string => !!x))];
    const userIds = [...new Set(rows.map((r) => r.resolvedById).filter((x): x is string => !!x))];
    const bookingIds = [...new Set(rows.map((r) => r.bookingId).filter((x): x is string => !!x))];
    const bookings = new Map(
      (bookingIds.length
        ? await this.db.booking.findMany({ where: { id: { in: bookingIds } }, ...BOOKING })
        : []
      ).map((b) => [b.id, bookingView(b)]),
    );
    const [tenants, payments, users] = await Promise.all([
      tenantIds.length
        ? this.db.tenant.findMany({ where: { id: { in: tenantIds } }, ...TENANT })
        : [],
      paymentIds.length
        ? this.db.payment.findMany({
            where: { id: { in: paymentIds } },
            select: { id: true, number: true },
          })
        : [],
      userIds.length
        ? this.db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);
    const t = new Map(tenants.map((x) => [x.id, x]));
    const p = new Map(payments.map((x) => [x.id, x]));
    const u = new Map(users.map((x) => [x.id, { id: x.id, name: `${x.firstName} ${x.lastName}` }]));
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      providerRef: r.providerRef,
      amount: r.amount,
      payerName: r.payerName,
      payerPhone: r.payerPhone,
      accountRef: r.accountRef,
      occurredAt: r.occurredAt,
      matchStatus: r.matchStatus,
      matchedBy: r.matchedBy,
      channel: { id: r.channel.id, name: r.channel.name, kind: r.channel.kind },
      tenant: r.tenantId ? (t.get(r.tenantId) ?? null) : null,
      booking: r.bookingId ? (bookings.get(r.bookingId) ?? null) : null,
      payment: r.paymentId ? (p.get(r.paymentId) ?? null) : null,
      ignoredReason: r.ignoredReason,
      resolvedBy: r.resolvedById ? (u.get(r.resolvedById) ?? null) : null,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    }));
  }

  async list(q: ListInboundQueryDto) {
    const term = q.q?.trim();
    const where: Prisma.InboundTransactionWhereInput = {
      AND: [
        q.status ? { matchStatus: q.status } : {},
        q.channelId ? { channelId: q.channelId } : {},
        q.source ? { source: q.source } : {},
        q.from ? { occurredAt: { gte: parseDateOnly(q.from) } } : {},
        q.to ? { occurredAt: { lt: new Date(parseDateOnly(q.to).getTime() + 86_400_000) } } : {},
        term
          ? {
              OR: [
                { providerRef: { contains: term, mode: 'insensitive' } },
                { accountRef: { contains: term, mode: 'insensitive' } },
                { payerName: { contains: term, mode: 'insensitive' } },
                { payerPhone: { contains: term.replace(/\s/g, '') } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.inboundTransaction.findMany({
        where,
        include: { channel: true },
        orderBy: { occurredAt: 'desc' },
        ...toSkipTake(q),
      }),
      this.db.inboundTransaction.count({ where }),
    ]);
    return paginated(await this.view(rows), total, q);
  }

  async get(id: string) {
    const r = await this.find(id);
    const [item] = await this.view([r]);
    return {
      ...item!,
      raw: r.raw,
      suggestions: await this.suggestions(r),
      bookingSuggestions: await this.bookingSuggestions(r),
    };
  }

  /** Likely tenants for an unmatched transaction (phone, then name), visible to the caller. */
  private async suggestions(r: {
    matchStatus: string;
    payerPhone: string | null;
    payerName: string | null;
  }) {
    if (r.matchStatus !== 'UNMATCHED') return [];
    const out: {
      tenant: { id: string; code: string; firstName: string; lastName: string };
      reason: string;
    }[] = [];
    if (r.payerPhone) {
      for (const t of await this.db.tenant.findMany({
        where: { AND: [{ phone: r.payerPhone }, tenantScope()] },
        ...TENANT,
      })) {
        out.push({ tenant: t, reason: 'Phone number matches' });
      }
    }
    const words = (r.payerName ?? '').split(/\s+/).filter((w) => w.length > 1);
    if (words.length >= 2) {
      const named = await this.db.tenant.findMany({
        where: {
          AND: [
            tenantScope(),
            { OR: words.map((w) => ({ firstName: { equals: w, mode: 'insensitive' as const } })) },
            { OR: words.map((w) => ({ lastName: { equals: w, mode: 'insensitive' as const } })) },
          ],
        },
        take: 5,
        ...TENANT,
      });
      for (const t of named)
        if (!out.some((o) => o.tenant.id === t.id)) out.push({ tenant: t, reason: 'Name matches' });
    }
    return out.slice(0, 5);
  }

  async assign(id: string, dto: AssignInboundDto) {
    if (Boolean(dto.tenantId) === Boolean(dto.bookingId)) {
      throw AppError.validation([
        {
          field: dto.bookingId ? 'tenantId' : 'bookingId',
          message: 'Choose a tenant or a booking',
        },
      ]);
    }
    if (dto.bookingId) return this.assignToBooking(id, dto.bookingId);
    const tenantId = dto.tenantId!;
    const ctx = orgContext();
    const r = await this.find(id);
    await this.tenants.find(tenantId);
    const paymentId = await this.db.$transaction(async (tx) => {
      // Claim it first: two people assigning at once can't both create a payment.
      const { count } = await tx.inboundTransaction.updateMany({
        where: { id, matchStatus: 'UNMATCHED' },
        data: { matchStatus: 'MATCHED', matchedBy: 'MANUAL', tenantId: tenantId },
      });
      if (!count) throw alreadyResolved();
      const created = await this.payments.recordAutomatic(tx, {
        orgId: ctx.orgId,
        tenantId: tenantId,
        channel: r.channel,
        amount: r.amount,
        reference: r.providerRef,
        receivedAt: r.occurredAt,
        paidBy: r.payerName,
        inboundId: r.id,
        allocations: dto.allocations,
      });
      await tx.payment.update({ where: { id: created }, data: { recordedById: ctx.userId } });
      await this.resolve(tx, id, {
        matchedBy: 'MANUAL',
        tenantId: tenantId,
        paymentId: created,
      });
      await this.audit.record(
        {
          action: 'inbound.assign',
          entity: 'inbound_transaction',
          entityId: id,
          after: { providerRef: r.providerRef, tenantId: tenantId, paymentId: created },
        },
        tx,
      );
      return created;
    });
    await this.payments.notifyReceipt(paymentId);
    return this.get(id);
  }

  /** Hosts: the money is for a stay — recorded on the booking exactly as an automatic match is. */
  private async assignToBooking(id: string, bookingId: string) {
    const ctx = orgContext();
    const r = await this.find(id);
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, kind: 'STAY' },
      select: { id: true, code: true },
    });
    if (!booking) throw AppError.notFound('Booking');
    const stayPaymentId = await this.db.$transaction(async (tx) => {
      // Claim it first: two people assigning at once can't both record a payment.
      const { count } = await tx.inboundTransaction.updateMany({
        where: { id, matchStatus: 'UNMATCHED' },
        data: { matchStatus: 'MATCHED', matchedBy: 'MANUAL', bookingId },
      });
      if (!count) throw alreadyResolved();
      const created = await this.stayPayments.record(tx, {
        bookingId,
        kind: 'PAYMENT',
        method: r.channel.kind as PaymentMethod,
        channelId: r.channel.id,
        amount: r.amount,
        reference: r.providerRef,
        receivedAt: r.occurredAt,
        inboundId: r.id,
        recordedById: ctx.userId,
      });
      await tx.inboundTransaction.update({
        where: { id },
        data: { stayPaymentId: created, resolvedById: ctx.userId ?? null, resolvedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'inbound.assign',
          entity: 'inbound_transaction',
          entityId: id,
          after: {
            providerRef: r.providerRef,
            bookingId,
            bookingCode: booking.code,
            stayPaymentId: created,
          },
        },
        tx,
      );
      return created;
    });
    await this.stayPayments.notifyPayment(stayPaymentId);
    return this.get(id);
  }

  /**
   * Hosts: likely bookings for an unmatched transaction — guest phone, then guest name, then a
   * booking owing exactly the amount. Only active or recent stays.
   */
  private async bookingSuggestions(r: {
    matchStatus: string;
    payerPhone: string | null;
    payerName: string | null;
    amount: bigint;
  }) {
    if (r.matchStatus !== 'UNMATCHED') return [];
    const org = await this.db.organization.findUnique({
      where: { id: orgContext().orgId },
      select: { kind: true },
    });
    if (org?.kind !== 'HOST') return [];
    const since = new Date(Date.now() - 30 * 86_400_000);
    const candidates = await this.db.booking.findMany({
      where: {
        kind: 'STAY',
        status: { in: ['REQUESTED', 'HELD', 'CONFIRMED', 'CHECKED_IN', 'EXPIRED', 'COMPLETED'] },
        checkOut: { gte: since },
      },
      orderBy: { checkIn: 'asc' },
      take: 300,
      ...BOOKING,
    });
    const words = (r.payerName ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    const out: { booking: ReturnType<typeof bookingView>; reason: string }[] = [];
    const add = (b: (typeof candidates)[number], reason: string) => {
      if (!out.some((o) => o.booking.id === b.id)) out.push({ booking: bookingView(b), reason });
    };
    for (const b of candidates) {
      if (r.payerPhone && b.guest?.phone === r.payerPhone) add(b, 'Guest phone matches');
    }
    if (words.length >= 2) {
      for (const b of candidates) {
        const name = (b.guest?.name ?? '').toLowerCase().split(/\s+/);
        if (words.filter((w) => name.includes(w)).length >= 2) add(b, 'Guest name matches');
      }
    }
    for (const b of candidates) {
      if (
        ['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status) &&
        bookingView(b).owed === r.amount.toString()
      ) {
        add(b, 'Owes exactly this amount');
      }
    }
    return out.slice(0, 5);
  }

  async ignore(id: string, dto: IgnoreInboundDto) {
    const ctx = orgContext();
    await this.find(id);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.inboundTransaction.updateMany({
        where: { id, matchStatus: 'UNMATCHED' },
        data: {
          matchStatus: 'IGNORED',
          ignoredReason: dto.reason.trim(),
          resolvedById: ctx.userId,
          resolvedAt: new Date(),
        },
      });
      if (!count) throw alreadyResolved();
      await this.audit.record(
        {
          action: 'inbound.ignore',
          entity: 'inbound_transaction',
          entityId: id,
          after: { reason: dto.reason.trim() },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async unignore(id: string) {
    await this.find(id);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.inboundTransaction.updateMany({
        where: { id, matchStatus: 'IGNORED' },
        data: {
          matchStatus: 'UNMATCHED',
          ignoredReason: null,
          resolvedById: null,
          resolvedAt: null,
        },
      });
      if (!count)
        throw AppError.conflict(
          'Only ignored transactions can be brought back',
          'ALREADY_RESOLVED',
        );
      await this.audit.record(
        { action: 'inbound.unignore', entity: 'inbound_transaction', entityId: id },
        tx,
      );
    });
    return this.get(id);
  }

  private async find(id: string) {
    const r = await this.db.inboundTransaction.findUnique({
      where: { id },
      include: { channel: true },
    });
    if (!r) throw AppError.notFound('Transaction');
    return r;
  }
}

const alreadyResolved = () =>
  AppError.conflict('Someone has already matched or ignored this transaction', 'ALREADY_RESOLVED');
