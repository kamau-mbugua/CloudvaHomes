import { Inject, Injectable } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type {
  InboundSource,
  MatchMethod,
  PaymentChannel,
  Prisma,
} from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { PaymentsService } from '../payments/payments.service.js';
import { tenantScope } from '../portfolio/property-scope.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { normalizeAccountRef } from './daraja.js';
import { guessesFor, unitSplits } from './matching.js';
import type { AssignInboundDto, IgnoreInboundDto, ListInboundQueryDto } from './mpesa.dto.js';

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
  ) {}

  /**
   * Stores and processes one transaction. Idempotent: a replay of a receipt already stored
   * returns the stored one untouched. `stk` = the request it answers (tenant already known).
   */
  async receive(
    channel: PaymentChannel,
    input: InboundInput,
    stk?: { tenantId: string; invoiceIds: string[] },
  ): Promise<{ inboundId: string; paymentId: string | null; replay: boolean }> {
    const existing = await this.db.inboundTransaction.findUnique({
      where: { channelId_providerRef: { channelId: channel.id, providerRef: input.providerRef } },
    });
    if (existing) return { inboundId: existing.id, paymentId: existing.paymentId, replay: true };

    let result: { inboundId: string; paymentId: string | null };
    try {
      result = await this.db.$transaction(async (tx) => {
        const inbound = await tx.inboundTransaction.create({
          data: { orgId: channel.orgId, channelId: channel.id, ...input },
        });
        // Entered by hand already? Link to it instead of paying twice.
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
        const match = stk
          ? { tenantId: stk.tenantId, by: 'AUTO_STK' as const, invoiceIds: stk.invoiceIds }
          : await this.match(tx, input);
        if (!match) return { inboundId: inbound.id, paymentId: null };
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
        return { inboundId: row.id, paymentId: row.paymentId, replay: true };
      }
      throw e;
    }
    if (result.paymentId) await this.payments.notifyReceipt(result.paymentId);
    return { ...result, replay: false };
  }

  /** Tenant for an unmatched transaction: account reference first, then phone. */
  private async match(
    tx: Tx,
    input: InboundInput,
  ): Promise<{ tenantId: string; by: MatchMethod; invoiceIds?: string[] } | null> {
    for (const g of guessesFor(input.accountRef)) {
      if (g.kind === 'tenant') {
        const t = await tx.tenant.findFirst({ where: { code: g.code }, select: { id: true } });
        if (t) return { tenantId: t.id, by: 'AUTO_ACCOUNT' };
      } else if (g.kind === 'invoice') {
        const i = await tx.invoice.findFirst({
          where: { number: g.number, status: { not: 'VOID' } },
          select: { id: true, tenantId: true },
        });
        if (i) return { tenantId: i.tenantId, by: 'AUTO_ACCOUNT', invoiceIds: [i.id] };
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
          if (tenantId) return { tenantId, by: 'AUTO_ACCOUNT' };
        }
      }
    }
    if (input.payerPhone) {
      const byPhone = await tx.tenant.findMany({
        where: { phone: input.payerPhone },
        select: { id: true },
        take: 2,
      });
      if (byPhone.length === 1) return { tenantId: byPhone[0]!.id, by: 'AUTO_PHONE' };
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
    return { ...item!, raw: r.raw, suggestions: await this.suggestions(r) };
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
    const ctx = orgContext();
    const r = await this.find(id);
    await this.tenants.find(dto.tenantId);
    const paymentId = await this.db.$transaction(async (tx) => {
      // Claim it first: two people assigning at once can't both create a payment.
      const { count } = await tx.inboundTransaction.updateMany({
        where: { id, matchStatus: 'UNMATCHED' },
        data: { matchStatus: 'MATCHED', matchedBy: 'MANUAL', tenantId: dto.tenantId },
      });
      if (!count) throw alreadyResolved();
      const created = await this.payments.recordAutomatic(tx, {
        orgId: ctx.orgId,
        tenantId: dto.tenantId,
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
        tenantId: dto.tenantId,
        paymentId: created,
      });
      await this.audit.record(
        {
          action: 'inbound.assign',
          entity: 'inbound_transaction',
          entityId: id,
          after: { providerRef: r.providerRef, tenantId: dto.tenantId, paymentId: created },
        },
        tx,
      );
      return created;
    });
    await this.payments.notifyReceipt(paymentId);
    return this.get(id);
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
