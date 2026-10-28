import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import type { InvoiceStatus } from '../../generated/prisma/client.js';
import type { Db, Tx } from '../../prisma/prisma.module.js';
import { depositDelta, oldestFirst } from './allocation.js';

/**
 * The single place money moves onto invoices (design §5.1). Everything here runs inside the
 * caller's transaction, after `lockTenant`, so one tenant's money operations happen one at a
 * time. Raw SQL is not org-scoped: every statement filters by ids already checked by the
 * caller, and writes carry the caller's orgId.
 */
export interface AllocatedEvent {
  orgId: string;
  paymentId: string;
  invoiceId: string;
  allocationId: string;
  amount: bigint; // negative = taken back (reversal)
  paidBefore: bigint;
  paidAfter: bigint;
  userId: string | null;
}

export interface DepositMovedEvent {
  orgId: string;
  tenancyId: string;
  kind: 'OPENING' | 'RECEIVED' | 'APPLIED' | 'REFUNDED' | 'REVERSAL';
  amount: bigint;
  paymentId?: string;
  invoiceId?: string;
  userId: string | null;
}

type Hook<E> = (tx: Tx, e: E) => Promise<void>;

@Injectable()
export class LedgerService {
  private readonly allocatedHooks: Hook<AllocatedEvent>[] = [];
  private readonly depositHooks: Hook<DepositMovedEvent>[] = [];

  /** Later modules (agency accounting) act in the same transaction as each allocation. */
  onAllocated(hook: Hook<AllocatedEvent>): void {
    this.allocatedHooks.push(hook);
  }

  /** …and as each deposit movement. */
  onDepositMoved(hook: Hook<DepositMovedEvent>): void {
    this.depositHooks.push(hook);
  }

  /** Serialises money operations for one tenant until the transaction ends. */
  async lockTenant(tx: Tx, tenantId: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM "tenants" WHERE "id" = ${tenantId}::uuid FOR UPDATE`;
  }

  /** Invoices with something left to pay, oldest due first. */
  async openInvoices(client: Db | Tx, tenantId: string) {
    const rows = await client.invoice.findMany({
      where: { tenantId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { number: 'asc' }],
    });
    return rows
      .map((i) => ({ ...i, balance: i.total - i.amountPaid - i.creditedAmount }))
      .filter((i) => i.balance > 0n);
  }

  /**
   * Moves `amount` (negative to undo) from a payment onto an invoice: allocation row,
   * `amountPaid` and status, and the deposit ledger for refundable move-in lines. A positive
   * amount never exceeds the invoice's balance — the update is conditional, so a racing
   * credit note or payment can't over-settle it.
   */
  async allocate(
    tx: Tx,
    p: {
      orgId: string;
      paymentId: string;
      invoiceId: string;
      amount: bigint;
      userId: string | null;
    },
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      { amountPaid: bigint; kind: string; tenancyId: string; status: InvoiceStatus }[]
    >`
      UPDATE "invoices"
         SET "amountPaid" = "amountPaid" + ${p.amount},
             "status" = (CASE
               WHEN "amountPaid" + ${p.amount} + "creditedAmount" >= "total" THEN 'PAID'
               WHEN "amountPaid" + ${p.amount} + "creditedAmount" > 0 THEN 'PARTIALLY_PAID'
               ELSE 'ISSUED' END)::"InvoiceStatus",
             "updatedAt" = now()
       WHERE "id" = ${p.invoiceId}::uuid
         AND "orgId" = ${p.orgId}::uuid
         AND "status" <> 'VOID'
         AND (${p.amount} < 0 OR "total" - "amountPaid" - "creditedAmount" >= ${p.amount})
      RETURNING "amountPaid", "kind", "tenancyId", "status"`;
    const inv = rows[0];
    if (!inv) {
      throw AppError.conflict(
        'That invoice changed while you were working. Reload and try again.',
        'CONFLICT',
      );
    }
    const allocation = await tx.paymentAllocation.create({
      data: { orgId: p.orgId, paymentId: p.paymentId, invoiceId: p.invoiceId, amount: p.amount },
    });
    const after = BigInt(inv.amountPaid);
    for (const hook of this.allocatedHooks) {
      await hook(tx, {
        orgId: p.orgId,
        paymentId: p.paymentId,
        invoiceId: p.invoiceId,
        allocationId: allocation.id,
        amount: p.amount,
        paidBefore: after - p.amount,
        paidAfter: after,
        userId: p.userId,
      });
    }

    if (inv.kind === 'MOVE_IN') {
      const refundable = await tx.invoiceLine.aggregate({
        where: { invoiceId: p.invoiceId, refundable: true },
        _sum: { amount: true },
      });
      const delta = depositDelta(refundable._sum.amount ?? 0n, after - p.amount, after);
      if (delta !== 0n) {
        await this.depositEntry(tx, {
          orgId: p.orgId,
          tenancyId: inv.tenancyId,
          kind: delta > 0n ? 'RECEIVED' : 'REVERSAL',
          amount: delta,
          paymentId: p.paymentId,
          invoiceId: p.invoiceId,
          userId: p.userId,
        });
      }
    }
  }

  /** Spends a payment's unallocated money on open invoices, oldest due first. */
  async spend(
    tx: Tx,
    p: { orgId: string; tenantId: string; paymentId: string; userId: string | null },
  ): Promise<bigint> {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: p.paymentId } });
    if (payment.unallocated <= 0n) return 0n;
    const { plan, remainder } = oldestFirst(
      await this.openInvoices(tx, p.tenantId),
      payment.unallocated,
    );
    for (const a of plan)
      await this.allocate(tx, { ...p, invoiceId: a.invoiceId, amount: a.amount });
    await tx.payment.update({ where: { id: p.paymentId }, data: { unallocated: remainder } });
    return payment.unallocated - remainder;
  }

  /** Uses the tenant's credit (oldest payment first) on open invoices. Returns the amount used. */
  async applyCredit(tx: Tx, p: { orgId: string; tenantId: string; userId: string | null }) {
    const sources = await tx.payment.findMany({
      where: { tenantId: p.tenantId, unallocated: { gt: 0n } },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    let used = 0n;
    for (const s of sources) {
      const spent = await this.spend(tx, { ...p, paymentId: s.id });
      used += spent;
      if (!spent) break; // nothing left open
    }
    await this.refreshCredit(tx, p.tenantId);
    return used;
  }

  /** Recomputes the cached `Tenant.creditBalance` from payments' unallocated money. */
  async refreshCredit(tx: Tx, tenantId: string): Promise<bigint> {
    const sum = await tx.payment.aggregate({
      where: { tenantId, unallocated: { gt: 0n } },
      _sum: { unallocated: true },
    });
    const credit = sum._sum.unallocated ?? 0n;
    await tx.tenant.update({ where: { id: tenantId }, data: { creditBalance: credit } });
    return credit;
  }

  /** Appends to a tenancy's deposit ledger and keeps `depositHeld` equal to its sum. */
  async depositEntry(
    tx: Tx,
    e: {
      orgId: string;
      tenancyId: string;
      kind: 'OPENING' | 'RECEIVED' | 'APPLIED' | 'REFUNDED' | 'REVERSAL';
      amount: bigint;
      paymentId?: string;
      invoiceId?: string;
      reference?: string | null;
      note?: string | null;
      userId: string | null;
    },
  ): Promise<void> {
    await tx.depositTransaction.create({
      data: {
        orgId: e.orgId,
        tenancyId: e.tenancyId,
        kind: e.kind,
        amount: e.amount,
        paymentId: e.paymentId ?? null,
        invoiceId: e.invoiceId ?? null,
        reference: e.reference ?? null,
        note: e.note ?? null,
        createdById: e.userId,
      },
    });
    const { count } = await tx.tenancy.updateMany({
      where: { id: e.tenancyId, depositHeld: { gte: -e.amount } },
      data: { depositHeld: { increment: e.amount } },
    });
    if (!count) throw AppError.conflict('The deposit held is less than that', 'CONFLICT');
    for (const hook of this.depositHooks) {
      await hook(tx, {
        orgId: e.orgId,
        tenancyId: e.tenancyId,
        kind: e.kind,
        amount: e.amount,
        paymentId: e.paymentId,
        invoiceId: e.invoiceId,
        userId: e.userId,
      });
    }
  }
}
