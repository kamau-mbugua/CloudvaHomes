import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { tenancyScope } from '../portfolio/property-scope.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { LedgerService } from './ledger.service.js';
import { receiptNumber } from './payments.service.js';
import type { SettleDepositDto } from './payments.dto.js';
import { buildStatement, type RawEntry } from './statement.js';

const KIND_LABEL = {
  MONTHLY: 'Monthly invoice',
  MOVE_IN: 'Move-in invoice',
  ADHOC: 'Invoice',
} as const;
const METHOD_LABEL = {
  MPESA_PAYBILL: 'M-Pesa',
  MPESA_TILL: 'M-Pesa',
  BANK_ACCOUNT: 'Bank',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  DEPOSIT: 'Deposit',
} as const;

/** Nairobi calendar date of an instant (credit notes are dated when issued). */
const nairobiDate = (d: Date) => todayInNairobi(d);

/** A tenant's account over time (statement) and their tenancies' deposits. */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly tenants: TenantsService,
  ) {}

  async statement(tenantId: string, q: { from?: string; to?: string }) {
    const tenant = await this.tenants.get(tenantId);
    const [invoices, notes, pays, t] = await Promise.all([
      this.db.invoice.findMany({ where: { tenantId, status: { not: 'VOID' } } }),
      this.db.creditNote.findMany({
        where: { invoice: { tenantId, status: { not: 'VOID' } } },
        include: { invoice: { select: { number: true, id: true } } },
      }),
      this.db.payment.findMany({
        where: { tenantId },
        include: { reverses: { select: { number: true } } },
      }),
      this.db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { creditBalance: true, tenancies: { select: { depositHeld: true } } },
      }),
    ]);
    const raw: RawEntry[] = [
      ...invoices.map((i) => ({
        date: formatDateOnly(i.issueDate),
        type: 'INVOICE' as const,
        reference: i.number,
        description: `${KIND_LABEL[i.kind]} ${i.period}`,
        amount: i.total,
        at: i.createdAt,
        invoiceId: i.id,
      })),
      ...notes.map((n) => ({
        date: nairobiDate(n.createdAt),
        type: 'CREDIT_NOTE' as const,
        reference: n.number,
        description: `Credit on ${n.invoice.number}: ${n.reason}`,
        amount: -n.amount,
        at: n.createdAt,
        invoiceId: n.invoice.id,
      })),
      ...pays.map((p) => ({
        date: formatDateOnly(p.receivedAt),
        type: (p.amount < 0n
          ? 'REVERSAL'
          : p.method === 'DEPOSIT'
            ? 'DEPOSIT_APPLIED'
            : 'PAYMENT') as RawEntry['type'],
        reference: p.number,
        description:
          p.amount < 0n
            ? `Reversal of ${p.reverses?.number ?? 'payment'}${p.reversalReason ? `: ${p.reversalReason}` : ''}`
            : `${METHOD_LABEL[p.method]} payment${p.reference ? ` ${p.reference}` : ''}`,
        amount: -p.amount,
        at: p.createdAt,
        paymentId: p.id,
      })),
    ];
    const first = raw.map((e) => e.date).sort()[0];
    const today = todayInNairobi();
    const from = q.from ?? first ?? today;
    const to = q.to ?? today;
    if (from > to)
      throw AppError.fieldInvalid('from', 'The start date must be before the end date');
    return {
      tenant: {
        id: tenant.id,
        code: tenant.code,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        phone: tenant.phone,
      },
      from,
      to,
      ...buildStatement(raw, from, to),
      creditBalance: t.creditBalance,
      depositHeld: t.tenancies.reduce((s, x) => s + x.depositHeld, 0n),
    };
  }

  async forStatementPdf(tenantId: string, q: { from?: string; to?: string }) {
    const statement = await this.statement(tenantId, q);
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgContext().orgId },
      select: { name: true, phone: true, email: true, kraPin: true },
    });
    return { statement, org };
  }

  async deposit(tenancyId: string) {
    const t = await this.findTenancy(tenancyId);
    const rows = await this.db.depositTransaction.findMany({
      where: { tenancyId },
      orderBy: { createdAt: 'asc' },
    });
    const ids = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
    const users = ids.length
      ? await this.db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return {
      tenancyId,
      held: t.depositHeld,
      transactions: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: r.amount,
        reference: r.reference,
        note: r.note,
        paymentId: r.paymentId,
        invoiceId: r.invoiceId,
        createdAt: r.createdAt,
        createdBy: r.createdById
          ? { id: r.createdById, name: names.get(r.createdById) ?? 'Unknown user' }
          : null,
      })),
    };
  }

  /**
   * Move-out: use some of the deposit on what the tenant owes (a DEPOSIT payment, oldest
   * invoice first) and/or record a refund. Both together can't exceed what is held.
   */
  async settleDeposit(tenancyId: string, dto: SettleDepositDto) {
    const ctx = orgContext();
    const t = await this.findTenancy(tenancyId);
    if (t.status === 'ACTIVE') {
      throw AppError.conflict('Give notice or move the tenant out first', 'TENANCY_ACTIVE');
    }
    const apply = BigInt(dto.applyAmount ?? 0);
    const refund = BigInt(dto.refundAmount ?? 0);
    if (apply <= 0n && refund <= 0n) {
      throw AppError.fieldInvalid('applyAmount', 'Enter an amount to apply or refund');
    }
    if (apply > 0n && !ctx.permissions.has('payments:create')) throw AppError.forbidden();
    if (refund > 0n && !ctx.permissions.has('payments:refund')) throw AppError.forbidden();
    await this.db.$transaction(async (tx) => {
      await this.ledger.lockTenant(tx, t.tenantId);
      const held = (await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId } })).depositHeld;
      if (apply + refund > held) {
        throw AppError.fieldInvalid('applyAmount', 'That is more than the deposit held');
      }
      const today = todayInNairobi();
      if (apply > 0n) {
        const owed = (await this.ledger.openInvoices(tx, t.tenantId)).reduce(
          (s, i) => s + i.balance,
          0n,
        );
        if (apply > owed) {
          throw AppError.fieldInvalid(
            'applyAmount',
            'That is more than the tenant owes; refund the rest',
          );
        }
        const payment = await tx.payment.create({
          data: {
            orgId: ctx.orgId,
            number: await receiptNumber(tx, ctx.orgId, today),
            tenantId: t.tenantId,
            tenancyId,
            channelId: null,
            method: 'DEPOSIT',
            amount: apply,
            unallocated: apply,
            receivedAt: new Date(`${today}T00:00:00.000Z`),
            note: dto.note?.trim() || 'Deposit applied at move-out',
            recordedById: ctx.userId,
          },
        });
        await this.ledger.spend(tx, {
          orgId: ctx.orgId,
          tenantId: t.tenantId,
          paymentId: payment.id,
          userId: ctx.userId,
        });
        await this.ledger.depositEntry(tx, {
          orgId: ctx.orgId,
          tenancyId,
          kind: 'APPLIED',
          amount: -apply,
          paymentId: payment.id,
          note: dto.note?.trim() || null,
          userId: ctx.userId,
        });
        await this.ledger.refreshCredit(tx, t.tenantId);
      }
      if (refund > 0n) {
        await this.ledger.depositEntry(tx, {
          orgId: ctx.orgId,
          tenancyId,
          kind: 'REFUNDED',
          amount: -refund,
          reference: dto.refundReference?.trim() || null,
          note: dto.note?.trim() || null,
          userId: ctx.userId,
        });
      }
      await this.audit.record(
        {
          action: 'deposit.settle',
          entity: 'tenancy',
          entityId: tenancyId,
          before: { held },
          after: { applied: apply, refunded: refund, reference: dto.refundReference ?? null },
        },
        tx,
      );
    });
    return this.deposit(tenancyId);
  }

  private async findTenancy(id: string) {
    const t = await this.db.tenancy.findFirst({ where: { AND: [{ id }, tenancyScope()] } });
    if (!t) throw AppError.notFound('Tenancy');
    return t;
  }
}
