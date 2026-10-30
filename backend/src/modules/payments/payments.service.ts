import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError, type ErrorDetail } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import {
  money,
  readOrgDocumentInstructions,
  readSystemDocumentInstructions,
} from '../../common/pdf/pdf.js';
import type { PaymentChannel, Prisma } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { nextCode } from '../portfolio/codes.js';
import { tenantScope } from '../portfolio/property-scope.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { ChannelsService } from './channels/channels.service.js';
import { LedgerService } from './ledger.service.js';
import type { CreatePaymentDto, ListPaymentsQueryDto, ReversePaymentDto } from './payments.dto.js';
import { renderReceiptPdf } from './pdfs.js';

const METHOD_NAMES: Record<string, string> = {
  MPESA_PAYBILL: 'M-Pesa Paybill',
  MPESA_TILL: 'M-Pesa Till',
  BANK_ACCOUNT: 'Bank transfer',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  DEPOSIT: 'Deposit applied',
};

const LIST_INCLUDE = {
  tenant: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
  channel: { select: { id: true, name: true, kind: true } },
  reversedBy: { select: { id: true, number: true } },
} satisfies Prisma.PaymentInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  allocations: {
    orderBy: { createdAt: 'asc' },
    include: { invoice: { select: { id: true, number: true, period: true, kind: true } } },
  },
} satisfies Prisma.PaymentInclude;

type ListRow = Prisma.PaymentGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.PaymentGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Receipt numbers: RCT-2026-000012 per organisation per year. */
export function receiptNumber(tx: Tx, orgId: string, date: string) {
  const year = date.slice(0, 4);
  return nextCode(tx, orgId, `receipt:${year}`, `RCT-${year}-`, 6);
}

/** "Balance KES 1,200.00" / "Credit KES 300.00" / "Nothing owing" — for receipts. */
export function balanceText(owed: bigint): string {
  if (owed > 0n) return `Balance KES ${money(owed)}`;
  if (owed < 0n) return `Credit KES ${money(-owed)}`;
  return 'Nothing owing';
}

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly channels: ChannelsService,
    private readonly tenants: TenantsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async names(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const users = unique.length
      ? await this.db.user.findMany({
          where: { id: { in: unique } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  }

  private toPayment(p: ListRow, names: Map<string, string>) {
    return {
      id: p.id,
      number: p.number,
      method: p.method,
      amount: p.amount,
      unallocated: p.unallocated,
      reference: p.reference,
      paidBy: p.paidBy,
      note: p.note,
      receivedAt: formatDateOnly(p.receivedAt),
      tenant: p.tenant,
      channel: p.channel,
      tenancyId: p.tenancyId,
      inboundId: p.inboundId,
      reversesId: p.reversesId,
      reversedBy: p.reversedBy,
      reversalReason: p.reversalReason,
      recordedBy: p.recordedById
        ? { id: p.recordedById, name: names.get(p.recordedById) ?? 'Unknown user' }
        : null,
      createdAt: p.createdAt,
    };
  }

  async list(q: ListPaymentsQueryDto) {
    const term = q.q?.trim();
    const where: Prisma.PaymentWhereInput = {
      AND: [
        { tenant: tenantScope() },
        q.tenantId ? { tenantId: q.tenantId } : {},
        q.channelId ? { channelId: q.channelId } : {},
        q.method ? { method: q.method } : {},
        q.from ? { receivedAt: { gte: parseDateOnly(q.from) } } : {},
        q.to ? { receivedAt: { lte: parseDateOnly(q.to) } } : {},
        q.reversed === false ? { reversesId: null, reversedBy: null } : {},
        q.reversed === true
          ? { OR: [{ reversesId: { not: null } }, { reversedBy: { isNot: null } }] }
          : {},
        term
          ? {
              OR: [
                { number: { contains: term, mode: 'insensitive' } },
                { reference: { contains: term, mode: 'insensitive' } },
                { paidBy: { contains: term, mode: 'insensitive' } },
                {
                  tenant: {
                    OR: [
                      { firstName: { contains: term, mode: 'insensitive' } },
                      { lastName: { contains: term, mode: 'insensitive' } },
                      { code: { contains: term, mode: 'insensitive' } },
                      { phone: { contains: term.replace(/\s/g, '') } },
                    ],
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.payment.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.payment.count({ where }),
    ]);
    const names = await this.names(rows.map((r) => r.recordedById));
    return paginated(
      rows.map((r) => this.toPayment(r, names)),
      total,
      q,
    );
  }

  async get(id: string) {
    const p = await this.find(id);
    const names = await this.names([p.recordedById]);
    return {
      ...this.toPayment(p, names),
      allocations: p.allocations.map((a) => ({ invoice: a.invoice, amount: a.amount })),
    };
  }

  /** Everything the receipt PDF needs. */
  async forReceipt(id: string) {
    const payment = await this.get(id);
    const p = await this.find(id);
    const [org, platformSettings, balance] = await Promise.all([
      this.db.organization.findUniqueOrThrow({
        where: { id: p.orgId },
        select: { name: true, phone: true, email: true, kraPin: true, settings: true },
      }),
      this.db.platformSettings.findUnique({
        where: { id: 1 },
        select: { emailTemplates: true },
      }),
      this.tenantBalance(this.db, p.tenantId),
    ]);
    const orgDocs = readOrgDocumentInstructions(org.settings);
    const sysDocs = readSystemDocumentInstructions(platformSettings?.emailTemplates);
    return {
      payment,
      org: { name: org.name, phone: org.phone, email: org.email, kraPin: org.kraPin },
      balance,
      instructions: {
        org: orgDocs.receiptInstructions,
        system: sysDocs.receiptInstructions,
      },
    };
  }

  /** Invoiced − credited − paid; negative = the tenant is in credit. Void invoices don't count. */
  async tenantBalance(client: Db | Tx, tenantId: string): Promise<bigint> {
    const [inv, paid] = await Promise.all([
      client.invoice.aggregate({
        where: { tenantId, status: { not: 'VOID' } },
        _sum: { total: true, creditedAmount: true },
      }),
      client.payment.aggregate({ where: { tenantId }, _sum: { amount: true } }),
    ]);
    return (inv._sum.total ?? 0n) - (inv._sum.creditedAmount ?? 0n) - (paid._sum.amount ?? 0n);
  }

  async openInvoices(tenantId: string) {
    await this.tenants.find(tenantId);
    const rows = await this.ledger.openInvoices(this.db, tenantId);
    const today = todayInNairobi();
    return rows.map((i) => ({
      id: i.id,
      number: i.number,
      kind: i.kind,
      period: i.period,
      issueDate: formatDateOnly(i.issueDate),
      dueDate: formatDateOnly(i.dueDate),
      total: i.total,
      amountPaid: i.amountPaid,
      creditedAmount: i.creditedAmount,
      balance: i.balance,
      overdue: formatDateOnly(i.dueDate) < today,
    }));
  }

  /**
   * A retried request with the same `Idempotency-Key` gets the payment it already made (no new
   * payment, no second SMS). The same key with different details is refused.
   */
  private async replay(key: string, dto: CreatePaymentDto) {
    const existing = await this.db.payment.findFirst({ where: { idempotencyKey: key } });
    if (!existing) return null;
    if (
      existing.tenantId !== dto.tenantId ||
      existing.channelId !== dto.channelId ||
      existing.amount !== BigInt(dto.amount)
    ) {
      throw AppError.conflict(
        'This Idempotency-Key was already used for a different payment',
        'IDEMPOTENCY_MISMATCH',
      );
    }
    return { ...(await this.get(existing.id)), receiptSent: false, replayed: true };
  }

  async create(dto: CreatePaymentDto, idempotencyKey?: string) {
    const ctx = orgContext();
    if (idempotencyKey) {
      const replayed = await this.replay(idempotencyKey, dto);
      if (replayed) return replayed;
    }
    const tenant = await this.tenants.find(dto.tenantId);
    const channel = await this.channels.find(dto.channelId);
    if (channel.status !== 'ACTIVE') {
      throw AppError.conflict('This payment channel is inactive', 'CHANNEL_INACTIVE');
    }
    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw AppError.fieldInvalid('amount', 'Enter an amount above zero');
    if (dto.receivedAt > todayInNairobi()) {
      throw AppError.fieldInvalid('receivedAt', 'The date can’t be in the future');
    }
    const reference = dto.reference?.trim().toUpperCase() || null;

    let id: string;
    try {
      id = await this.db.$transaction(async (tx) => {
        await this.ledger.lockTenant(tx, tenant.id);
        if (reference) {
          const dup = await tx.payment.findFirst({
            where: { channelId: channel.id, reference, amount: { gt: 0n } },
            select: { number: true },
          });
          if (dup) throw duplicate(dup.number);
        }
        const payment = await tx.payment.create({
          data: {
            orgId: ctx.orgId,
            number: await receiptNumber(tx, ctx.orgId, dto.receivedAt),
            tenantId: tenant.id,
            channelId: channel.id,
            method: channel.kind,
            amount,
            unallocated: amount,
            reference,
            paidBy: dto.paidBy?.trim() || null,
            note: dto.note?.trim() || null,
            receivedAt: parseDateOnly(dto.receivedAt),
            recordedById: ctx.userId,
            idempotencyKey: idempotencyKey ?? null,
          },
        });
        const base = { orgId: ctx.orgId, paymentId: payment.id, userId: ctx.userId };
        if (dto.allocations) {
          const plan = await this.checkAllocations(tx, tenant.id, amount, dto.allocations);
          for (const a of plan) await this.ledger.allocate(tx, { ...base, ...a });
          const used = plan.reduce((s, a) => s + a.amount, 0n);
          await tx.payment.update({
            where: { id: payment.id },
            data: { unallocated: amount - used },
          });
        } else {
          await this.ledger.spend(tx, { ...base, tenantId: tenant.id });
        }
        await this.ledger.refreshCredit(tx, tenant.id);
        await this.audit.record(
          {
            action: 'payment.create',
            entity: 'payment',
            entityId: payment.id,
            after: {
              number: payment.number,
              tenantId: tenant.id,
              channelId: channel.id,
              amount,
              reference,
              receivedAt: dto.receivedAt,
              allocations: dto.allocations ?? 'oldest-first',
            },
          },
          tx,
        );
        return payment.id;
      });
    } catch (e) {
      if (violatesUnique(e, 'payments_one_per_channel_reference')) throw duplicate();
      // Two identical retries raced: the other one made the payment.
      if (idempotencyKey && violatesUnique(e, 'idempotencyKey')) {
        const replayed = await this.replay(idempotencyKey, dto);
        if (replayed) return replayed;
      }
      throw e;
    }

    const result = await this.get(id);
    const receiptSent =
      dto.notifyTenant === false ? false : await this.sendReceipt(id, tenant.phone, result.number);
    return { ...result, receiptSent, replayed: false };
  }

  /**
   * A payment that arrived by itself (M-Pesa), inside the caller's transaction. No signed-in
   * user: `recordedById` is null. Money goes to `preferInvoiceIds` first (an STK request's
   * invoices), then oldest due first; the rest is credit. Call `notifyReceipt` after commit.
   */
  async recordAutomatic(
    tx: Tx,
    p: {
      orgId: string;
      tenantId: string;
      channel: { id: string; kind: PaymentChannel['kind'] };
      amount: bigint;
      reference: string;
      receivedAt: Date;
      paidBy: string | null;
      inboundId: string;
      preferInvoiceIds?: string[];
      /** Chosen by a person reconciling: exactly these amounts, the rest is credit. */
      allocations?: { invoiceId: string; amount: number }[];
    },
  ): Promise<string> {
    await this.ledger.lockTenant(tx, p.tenantId);
    const date = todayInNairobi(p.receivedAt);
    const payment = await tx.payment.create({
      data: {
        orgId: p.orgId,
        number: await receiptNumber(tx, p.orgId, date),
        tenantId: p.tenantId,
        channelId: p.channel.id,
        method: p.channel.kind,
        amount: p.amount,
        unallocated: p.amount,
        reference: p.reference.toUpperCase(),
        paidBy: p.paidBy,
        receivedAt: parseDateOnly(date),
        inboundId: p.inboundId,
        recordedById: null,
      },
    });
    const base = { orgId: p.orgId, paymentId: payment.id, userId: null };
    let left = p.amount;
    if (p.allocations) {
      const plan = await this.checkAllocations(tx, p.tenantId, p.amount, p.allocations);
      for (const a of plan) await this.ledger.allocate(tx, { ...base, ...a });
      left -= plan.reduce((sum, a) => sum + a.amount, 0n);
      await tx.payment.update({ where: { id: payment.id }, data: { unallocated: left } });
    } else if (p.preferInvoiceIds?.length) {
      const open = await this.ledger.openInvoices(tx, p.tenantId);
      for (const inv of open.filter((i) => p.preferInvoiceIds!.includes(i.id))) {
        if (left <= 0n) break;
        const take = inv.balance < left ? inv.balance : left;
        await this.ledger.allocate(tx, { ...base, invoiceId: inv.id, amount: take });
        left -= take;
      }
      await tx.payment.update({ where: { id: payment.id }, data: { unallocated: left } });
    }
    if (!p.allocations) await this.ledger.spend(tx, { ...base, tenantId: p.tenantId });
    await this.ledger.refreshCredit(tx, p.tenantId);
    await this.audit.record(
      {
        action: 'payment.create',
        entity: 'payment',
        entityId: payment.id,
        after: {
          number: payment.number,
          tenantId: p.tenantId,
          amount: p.amount,
          reference: payment.reference,
          source: 'mpesa',
        },
        orgId: p.orgId,
        actorId: null,
      },
      tx,
    );
    return payment.id;
  }

  /** Receipt notification (SMS + detailed email with PDF receipt attached) after commit. */
  async notifyReceipt(paymentId: string): Promise<boolean> {
    const p = await this.find(paymentId);
    return this.sendReceipt(paymentId, p.tenant.phone, p.number);
  }

  /** After commit, best effort: sends SMS receipt + detailed email receipt with PDF attached. */
  private async sendReceipt(id: string, phone: string, number: string): Promise<boolean> {
    try {
      const receiptData = await this.forReceipt(id);
      const { payment, org, balance } = receiptData;
      const standing = balanceText(balance);
      let sentAny = false;
      try {
        await this.notifications.sendPaymentReceipt(phone, {
          amount: money(payment.amount),
          number,
          balance: standing,
          organizationName: org.name,
        });
        sentAny = true;
      } catch (e) {
        this.log.warn({ err: e, paymentId: id }, 'Payment receipt SMS failed');
      }

      const tenantRow = await this.db.tenant.findUnique({
        where: { id: payment.tenant.id },
        select: { email: true },
      });
      if (tenantRow?.email) {
        try {
          const pdfBuffer = await renderReceiptPdf(receiptData);
          const allocationsSummary =
            payment.allocations.length > 0
              ? payment.allocations
                  .map((a) => `- ${a.invoice.number} (${a.invoice.period}): KES ${money(a.amount)}`)
                  .join('\n')
              : `- Held as credit on your tenant account (KES ${money(payment.unallocated)})`;
          await this.notifications.sendTenantPaymentReceiptEmail(
            { email: tenantRow.email, phone },
            {
              firstName: payment.tenant.firstName,
              lastName: payment.tenant.lastName,
              organizationName: org.name,
              tenantCode: payment.tenant.code,
              receiptNumber: payment.number,
              amountKes: money(payment.amount),
              receivedAt: payment.receivedAt,
              paymentMethod: METHOD_NAMES[payment.method] ?? payment.method,
              channelName: payment.channel?.name ?? 'Deposit',
              reference: payment.reference ?? '—',
              paidBy: payment.paidBy ?? `${payment.tenant.firstName} ${payment.tenant.lastName}`,
              allocationsSummary,
              unallocatedCreditKes: money(payment.unallocated),
              accountStanding: standing,
              pdfBuffer,
            },
          );
          sentAny = true;
        } catch (e) {
          this.log.warn({ err: e, paymentId: id }, 'Payment receipt email failed');
        }
      }
      return sentAny;
    } catch (e) {
      this.log.warn({ err: e, paymentId: id }, 'Payment receipt notification failed');
      return false;
    }
  }

  /** Explicit allocations: open invoices of this tenant, each ≤ its balance, total ≤ amount. */
  private async checkAllocations(
    tx: Tx,
    tenantId: string,
    amount: bigint,
    allocations: { invoiceId: string; amount: number }[],
  ) {
    const open = new Map((await this.ledger.openInvoices(tx, tenantId)).map((i) => [i.id, i]));
    const details: ErrorDetail[] = [];
    const seen = new Set<string>();
    let total = 0n;
    const plan = allocations.flatMap((a, i) => {
      const inv = open.get(a.invoiceId);
      const value = BigInt(a.amount);
      if (!inv || seen.has(a.invoiceId)) {
        details.push({
          field: `allocations[${i}].invoiceId`,
          message: 'Choose an open invoice of this tenant, once',
        });
        return [];
      }
      seen.add(a.invoiceId);
      if (value > inv.balance) {
        details.push({
          field: `allocations[${i}].amount`,
          message: `At most the balance of ${inv.number} (${money(inv.balance)})`,
        });
      }
      total += value;
      return value > 0n ? [{ invoiceId: a.invoiceId, amount: value }] : [];
    });
    if (total > amount) {
      details.push({ field: 'allocations', message: 'Allocations add up to more than the amount' });
    }
    if (details.length) throw AppError.validation(details);
    return plan;
  }

  /**
   * Undoes a payment with a negative one that mirrors every allocation it made (including
   * credit it later paid towards newer invoices). Its unused credit disappears with it.
   */
  async reverse(id: string, dto: ReversePaymentDto) {
    const ctx = orgContext();
    const original = await this.find(id);
    if (original.reversesId || original.amount < 0n) {
      throw AppError.conflict('A reversal can’t itself be reversed', 'IS_REVERSAL');
    }
    if (original.reversedBy) throw alreadyReversed(original.reversedBy.number);
    const today = todayInNairobi();
    let reversalId: string;
    try {
      reversalId = await this.db.$transaction(async (tx) => {
        await this.ledger.lockTenant(tx, original.tenantId);
        const reversal = await tx.payment.create({
          data: {
            orgId: ctx.orgId,
            number: await receiptNumber(tx, ctx.orgId, today),
            tenantId: original.tenantId,
            channelId: original.channelId,
            tenancyId: original.tenancyId,
            method: original.method,
            amount: -original.amount,
            unallocated: 0n,
            reference: original.reference,
            receivedAt: parseDateOnly(today),
            reversesId: original.id,
            reversalReason: dto.reason.trim(),
            recordedById: ctx.userId,
          },
        });
        // Net per invoice, so a later partial reversal pattern can't double-count.
        const byInvoice = new Map<string, bigint>();
        for (const a of await tx.paymentAllocation.findMany({
          where: { paymentId: original.id },
        })) {
          byInvoice.set(a.invoiceId, (byInvoice.get(a.invoiceId) ?? 0n) + a.amount);
        }
        for (const [invoiceId, sum] of byInvoice) {
          if (sum !== 0n) {
            await this.ledger.allocate(tx, {
              orgId: ctx.orgId,
              paymentId: reversal.id,
              invoiceId,
              amount: -sum,
              userId: ctx.userId,
            });
          }
        }
        await tx.payment.update({ where: { id: original.id }, data: { unallocated: 0n } });
        if (original.method === 'DEPOSIT' && original.tenancyId) {
          // The deposit that paid these invoices is held again.
          await this.ledger.depositEntry(tx, {
            orgId: ctx.orgId,
            tenancyId: original.tenancyId,
            kind: 'REVERSAL',
            amount: original.amount,
            paymentId: reversal.id,
            note: `Reversal of ${original.number}`,
            userId: ctx.userId,
          });
        }
        await this.ledger.refreshCredit(tx, original.tenantId);
        await this.audit.record(
          {
            action: 'payment.reverse',
            entity: 'payment',
            entityId: original.id,
            after: {
              reversal: reversal.number,
              amount: original.amount,
              reason: dto.reason.trim(),
            },
          },
          tx,
        );
        return reversal.id;
      });
    } catch (e) {
      if (violatesUnique(e, 'reversesId')) throw alreadyReversed();
      throw e;
    }
    return this.get(reversalId);
  }

  async applyCredit(tenantId: string) {
    const ctx = orgContext();
    await this.tenants.find(tenantId);
    const applied = await this.db.$transaction(async (tx) => {
      await this.ledger.lockTenant(tx, tenantId);
      const used = await this.ledger.applyCredit(tx, {
        orgId: ctx.orgId,
        tenantId,
        userId: ctx.userId,
      });
      if (used > 0n) {
        await this.audit.record(
          {
            action: 'payment.apply_credit',
            entity: 'tenant',
            entityId: tenantId,
            after: { applied: used },
          },
          tx,
        );
      }
      return used;
    });
    const t = await this.db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { creditBalance: true },
    });
    return { applied, creditBalance: t.creditBalance };
  }

  private async find(id: string): Promise<DetailRow> {
    const p = await this.db.payment.findFirst({
      where: { id, tenant: tenantScope() },
      include: DETAIL_INCLUDE,
    });
    if (!p) throw AppError.notFound('Payment');
    return p;
  }
}

const duplicate = (number?: string) =>
  AppError.conflict(
    number
      ? `This reference was already recorded on this channel (${number})`
      : 'This reference was already recorded on this channel',
    'DUPLICATE_REFERENCE',
  );
const alreadyReversed = (number?: string) =>
  AppError.conflict(
    number ? `This payment was already reversed (${number})` : 'This payment was already reversed',
    'ALREADY_REVERSED',
  );
