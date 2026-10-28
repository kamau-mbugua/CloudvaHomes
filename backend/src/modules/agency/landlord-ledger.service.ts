import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { percentOf } from '../../common/money/money.js';
import type {
  Expense,
  LedgerBucket,
  LedgerKind,
  ManagementAgreement,
  Prisma,
} from '../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext, requireStepUp } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import type { AllocatedEvent, DepositMovedEvent } from '../payments/ledger.service.js';
import { landlordScope } from '../portfolio/property-scope.js';
import { waterfall } from './agency-math.js';
import type { AdjustmentDto, LedgerQueryDto } from './agency.dto.js';
import { AgreementsService } from './agreements.service.js';
import { activeOrgId } from './org.js';

export interface EntryInput {
  orgId: string;
  landlordId: string;
  propertyId?: string | null;
  bucket: LedgerBucket;
  kind: LedgerKind;
  amount: bigint;
  agreementId?: string | null;
  paymentId?: string;
  allocationId?: string;
  invoiceId?: string;
  expenseId?: string;
  remittanceId?: string;
  tenancyId?: string;
  occurredAt: string; // YYYY-MM-DD
  memo?: string | null;
  userId: string | null;
}

/**
 * Each landlord's ledger (design §5.3): what the agency owes them (PAYABLE) and their tenants'
 * deposits it holds (DEPOSIT_HELD). Written by hooks inside the transaction of the event that
 * caused it — never recomputed — so it always agrees with payments, expenses and remittances.
 */
@Injectable()
export class LandlordLedgerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly agreements: AgreementsService,
  ) {}

  async write(tx: Tx, e: EntryInput): Promise<void> {
    if (e.amount === 0n) return;
    await tx.landlordLedgerEntry.create({
      data: {
        orgId: e.orgId,
        landlordId: e.landlordId,
        propertyId: e.propertyId ?? null,
        bucket: e.bucket,
        kind: e.kind,
        amount: e.amount,
        agreementId: e.agreementId ?? null,
        paymentId: e.paymentId ?? null,
        allocationId: e.allocationId ?? null,
        invoiceId: e.invoiceId ?? null,
        expenseId: e.expenseId ?? null,
        remittanceId: e.remittanceId ?? null,
        tenancyId: e.tenancyId ?? null,
        occurredAt: parseDateOnly(e.occurredAt),
        memo: e.memo ?? null,
        createdById: e.userId,
      },
    });
  }

  /** The property's landlord in an agency organisation, or null (landlord orgs have none). */
  private async landlordOf(tx: Tx, propertyId: string) {
    const p = await tx.property.findUnique({
      where: { id: propertyId },
      select: { landlordId: true, organization: { select: { kind: true } } },
    });
    return p?.organization.kind === 'AGENCY' && p.landlordId ? p.landlordId : null;
  }

  // ── Hooks ──

  /** Money applied to an invoice on a landlord's property: collection, deposit, commission. */
  async onAllocated(tx: Tx, e: AllocatedEvent): Promise<void> {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: e.invoiceId },
      include: {
        lines: { select: { kind: true, refundable: true, amount: true, position: true } },
      },
    });
    const landlordId = await this.landlordOf(tx, invoice.propertyId);
    if (!landlordId) return;
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: e.paymentId },
      select: { receivedAt: true },
    });
    const date = formatDateOnly(payment.receivedAt);
    const agreement = await this.agreements.applicable(tx, landlordId, invoice.propertyId, date);
    const base = {
      orgId: e.orgId,
      landlordId,
      propertyId: invoice.propertyId,
      agreementId: agreement?.id ?? null,
      paymentId: e.paymentId,
      allocationId: e.allocationId,
      invoiceId: e.invoiceId,
      tenancyId: invoice.tenancyId,
      occurredAt: date,
      userId: e.userId,
    };
    const holdDeposits = agreement?.holdDeposits ?? true;
    const landlordCollects = agreement?.collection === 'LANDLORD_COLLECTS';
    let collected = 0n;
    let commissionable = 0n;
    let deposit = 0n;
    for (const p of waterfall(invoice.lines, e.paidBefore, e.paidAfter)) {
      if (p.refundable && holdDeposits) deposit += p.amount;
      else collected += p.amount;
      if (!p.refundable && agreement?.commissionableLines.includes(p.kind))
        commissionable += p.amount;
    }
    if (deposit)
      await this.write(tx, { ...base, bucket: 'DEPOSIT_HELD', kind: 'DEPOSIT', amount: deposit });
    if (collected) {
      await this.write(tx, { ...base, bucket: 'PAYABLE', kind: 'COLLECTION', amount: collected });
      if (landlordCollects) {
        await this.write(tx, {
          ...base,
          bucket: 'PAYABLE',
          kind: 'COLLECTION',
          amount: -collected,
          memo: 'Paid directly to the landlord',
        });
      }
    }
    if (
      commissionable &&
      agreement?.commissionBasis === 'PERCENT_OF_COLLECTED' &&
      agreement.commissionBps
    ) {
      await this.write(tx, {
        ...base,
        bucket: 'PAYABLE',
        kind: 'COMMISSION',
        amount: -percentOf(commissionable, agreement.commissionBps),
      });
    }
  }

  /** Invoiced-basis commission is booked when the invoice is issued. */
  async onIssued(tx: Tx, invoiceId: string, sign: 1n | -1n, userId: string | null): Promise<void> {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lines: true },
    });
    const landlordId = await this.landlordOf(tx, invoice.propertyId);
    if (!landlordId) return;
    const date = formatDateOnly(invoice.issueDate);
    const agreement = await this.agreements.applicable(tx, landlordId, invoice.propertyId, date);
    if (agreement?.commissionBasis !== 'PERCENT_OF_INVOICED' || !agreement.commissionBps) return;
    const base = invoice.lines
      .filter((l) => !l.refundable && agreement.commissionableLines.includes(l.kind))
      .reduce((s, l) => s + l.amount, 0n);
    await this.write(tx, {
      orgId: invoice.orgId,
      landlordId,
      propertyId: invoice.propertyId,
      bucket: 'PAYABLE',
      kind: 'COMMISSION',
      amount: -sign * percentOf(base, agreement.commissionBps),
      agreementId: agreement.id,
      invoiceId,
      tenancyId: invoice.tenancyId,
      occurredAt: sign === 1n ? date : todayInNairobi(),
      memo: sign === 1n ? `Commission on ${invoice.number}` : `${invoice.number} voided`,
      userId,
    });
  }

  /** Deposits used or refunded at move-out (the receipt side comes through allocations). */
  async onDepositMoved(tx: Tx, e: DepositMovedEvent): Promise<void> {
    const isAllocationSide =
      e.kind === 'RECEIVED' || e.kind === 'OPENING' || (e.kind === 'REVERSAL' && e.invoiceId);
    if (isAllocationSide) return;
    const tenancy = await tx.tenancy.findUniqueOrThrow({
      where: { id: e.tenancyId },
      select: { unit: { select: { propertyId: true } } },
    });
    const propertyId = tenancy.unit.propertyId;
    const landlordId = await this.landlordOf(tx, propertyId);
    if (!landlordId) return;
    const date = todayInNairobi();
    const agreement = await this.agreements.applicable(tx, landlordId, propertyId, date);
    const memo = {
      APPLIED: 'Deposit used for the tenant’s balance',
      REFUNDED: 'Deposit refunded to the tenant',
      REVERSAL: 'Deposit use reversed',
    }[e.kind as 'APPLIED' | 'REFUNDED' | 'REVERSAL'];
    await this.write(tx, {
      orgId: e.orgId,
      landlordId,
      propertyId,
      bucket: agreement?.holdDeposits === false ? 'PAYABLE' : 'DEPOSIT_HELD',
      kind: 'DEPOSIT',
      amount: e.amount,
      agreementId: agreement?.id ?? null,
      paymentId: e.paymentId,
      tenancyId: e.tenancyId,
      occurredAt: date,
      memo,
      userId: e.userId,
    });
  }

  /** Expenses the agency paid on a landlord's property are deducted from their payout. */
  async onExpenseChanged(
    tx: Tx,
    c: { before: Expense | null; after: Expense | null; userId: string | null },
  ): Promise<void> {
    const book = async (x: Expense, sign: 1n | -1n, memo: string | null) => {
      const landlordId = await this.landlordOf(tx, x.propertyId);
      if (!landlordId) return;
      const date = formatDateOnly(x.incurredOn);
      const agreement = await this.agreements.applicable(tx, landlordId, x.propertyId, date);
      if (agreement && !agreement.deductExpenses) return;
      await this.write(tx, {
        orgId: x.orgId,
        landlordId,
        propertyId: x.propertyId,
        bucket: 'PAYABLE',
        kind: 'EXPENSE',
        amount: -sign * x.amount,
        agreementId: agreement?.id ?? null,
        expenseId: x.id,
        occurredAt: sign === 1n ? date : todayInNairobi(),
        memo: memo ?? x.name,
        userId: c.userId,
      });
    };
    // Only what counts changes the ledger: same property and amount → nothing to do.
    if (
      c.before &&
      c.after &&
      c.before.propertyId === c.after.propertyId &&
      c.before.amount === c.after.amount
    )
      return;
    if (c.before)
      await book(
        c.before,
        -1n,
        c.after ? `${c.before.name} (changed)` : `${c.before.name} (voided)`,
      );
    if (c.after) await book(c.after, 1n, null);
  }

  /** Fixed monthly commission, booked once per agreement per month (at remittance draft). */
  async bookFixedCommission(
    tx: Tx,
    landlordId: string,
    period: string,
    agreements: ManagementAgreement[],
    userId: string | null,
  ) {
    for (const a of agreements) {
      if (a.commissionBasis !== 'FIXED_MONTHLY' || !a.fixedAmount) continue;
      const memo = `Fixed commission ${period}`;
      if (
        await tx.landlordLedgerEntry.count({
          where: { agreementId: a.id, kind: 'COMMISSION', memo },
        })
      )
        continue;
      await this.write(tx, {
        orgId: a.orgId,
        landlordId,
        bucket: 'PAYABLE',
        kind: 'COMMISSION',
        amount: -a.fixedAmount,
        agreementId: a.id,
        occurredAt: `${period}-01`,
        memo,
        userId,
      });
    }
  }

  // ── Reading ──

  async balances(client: Db | Tx, landlordId: string, upTo?: Date) {
    const rows = await client.landlordLedgerEntry.groupBy({
      by: ['bucket'],
      where: { landlordId, ...(upTo ? { createdAt: { lte: upTo } } : {}) },
      _sum: { amount: true },
    });
    const get = (b: LedgerBucket) => rows.find((r) => r.bucket === b)?._sum.amount ?? 0n;
    return { payable: get('PAYABLE'), depositHeld: get('DEPOSIT_HELD') };
  }

  /** Entries newest first with each bucket's running balance after the entry. */
  async list(landlordId: string, q: LedgerQueryDto) {
    await this.findLandlord(landlordId);
    const where: Prisma.LandlordLedgerEntryWhereInput = {
      landlordId,
      ...(q.bucket ? { bucket: q.bucket } : {}),
      ...(q.from || q.to
        ? {
            occurredAt: {
              ...(q.from ? { gte: parseDateOnly(q.from) } : {}),
              ...(q.to ? { lte: parseDateOnly(q.to) } : {}),
            },
          }
        : {}),
    };
    const [total, ids] = await Promise.all([
      this.db.landlordLedgerEntry.count({ where }),
      this.db.landlordLedgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true },
      }),
    ]);
    const running = ids.length
      ? await this.db.$queryRaw<{ id: string; balance: bigint }[]>`
          SELECT id, balance FROM (
            SELECT "id", sum("amount") OVER (PARTITION BY "bucket" ORDER BY "createdAt", "id")::bigint AS balance
              FROM "landlord_ledger_entries" WHERE "landlordId" = ${landlordId}::uuid AND "orgId" = ${activeOrgId()}::uuid
          ) x WHERE "id" = ANY(${ids.map((i) => i.id)}::uuid[])`
      : [];
    const bal = new Map(running.map((r) => [r.id, BigInt(r.balance)]));
    const rows = await this.describe(ids.map((i) => i.id));
    return {
      data: rows.map((r) => ({ ...r, balance: bal.get(r.id) ?? 0n })),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        pages: total ? Math.ceil(total / q.pageSize) : 0,
      },
    };
  }

  /** Entries with the names a person needs (property, unit, tenant, receipt…), in the given order. */
  async describe(ids: string[], client: Db = this.db) {
    if (!ids.length) return [];
    const rows = await client.landlordLedgerEntry.findMany({ where: { id: { in: ids } } });
    const pick = <K extends keyof (typeof rows)[number]>(k: K) =>
      [
        ...new Set(rows.map((r) => r[k]).filter((x): x is NonNullable<typeof x> => !!x)),
      ] as string[];
    const [props, tenancies, payments, invoices, expenses, remittances] = await Promise.all([
      client.property.findMany({
        where: { id: { in: pick('propertyId') } },
        select: { id: true, code: true, name: true },
      }),
      client.tenancy.findMany({
        where: { id: { in: pick('tenancyId') } },
        select: {
          id: true,
          unit: { select: { id: true, number: true } },
          tenant: { select: { id: true, code: true, firstName: true, lastName: true } },
        },
      }),
      client.payment.findMany({
        where: { id: { in: pick('paymentId') } },
        select: { id: true, number: true },
      }),
      client.invoice.findMany({
        where: { id: { in: pick('invoiceId') } },
        select: { id: true, number: true },
      }),
      client.expense.findMany({
        where: { id: { in: pick('expenseId') } },
        select: { id: true, name: true },
      }),
      client.remittance.findMany({
        where: { id: { in: pick('remittanceId') } },
        select: { id: true, number: true },
      }),
    ]);
    const m = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const [P, T, PM, I, E, R] = [
      m(props),
      m(tenancies),
      m(payments),
      m(invoices),
      m(expenses),
      m(remittances),
    ];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => {
      const r = byId.get(id)!;
      const t = r.tenancyId ? T.get(r.tenancyId) : undefined;
      return {
        id: r.id,
        bucket: r.bucket,
        kind: r.kind,
        amount: r.amount,
        occurredAt: formatDateOnly(r.occurredAt),
        memo: r.memo,
        property: r.propertyId ? (P.get(r.propertyId) ?? null) : null,
        unit: t?.unit ?? null,
        tenant: t?.tenant ?? null,
        payment: r.paymentId ? (PM.get(r.paymentId) ?? null) : null,
        invoice: r.invoiceId ? (I.get(r.invoiceId) ?? null) : null,
        expense: r.expenseId ? (E.get(r.expenseId) ?? null) : null,
        remittance: r.remittanceId ? (R.get(r.remittanceId) ?? null) : null,
        createdAt: r.createdAt,
      };
    });
  }

  async adjust(landlordId: string, dto: AdjustmentDto) {
    requireStepUp();
    const ctx = orgContext();
    await this.findLandlord(landlordId);
    if (dto.amount === 0) throw AppError.fieldInvalid('amount', 'Enter an amount');
    await this.db.$transaction(async (tx) => {
      await this.write(tx, {
        orgId: ctx.orgId,
        landlordId,
        bucket: dto.bucket,
        kind: 'ADJUSTMENT',
        amount: BigInt(dto.amount),
        occurredAt: todayInNairobi(),
        memo: dto.memo.trim(),
        userId: ctx.userId,
      });
      await this.audit.record(
        {
          action: 'landlord.adjustment',
          entity: 'landlord',
          entityId: landlordId,
          after: { bucket: dto.bucket, amount: dto.amount, memo: dto.memo.trim() },
        },
        tx,
      );
    });
    return this.balances(this.db, landlordId);
  }

  async findLandlord(id: string) {
    const org = await this.db.organization.findUnique({
      where: { id: activeOrgId() },
      select: { kind: true },
    });
    if (org?.kind !== 'AGENCY')
      throw AppError.forbidden('AGENCY_ONLY', 'Landlords are only used by agencies');
    const l = await this.db.landlord.findFirst({ where: { AND: [{ id }, landlordScope()] } });
    if (!l) throw AppError.notFound('Landlord');
    return l;
  }
}
