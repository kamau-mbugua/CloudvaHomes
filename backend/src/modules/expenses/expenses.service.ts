import { Inject, Injectable, Logger } from '@nestjs/common';
import { emptyContext, runWithContext } from '../../common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toCsv } from '../../common/http/csv.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { pageMeta } from '../../common/http/pagination.js';
import type { Expense, Prisma, RecurringExpense } from '../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { optionalText } from '../portfolio/fields.js';
import { PropertiesService } from '../portfolio/properties/properties.service.js';
import { propertyScope } from '../portfolio/property-scope.js';
import type {
  CreateExpenseDto,
  CreateRecurringDto,
  ListExpensesQueryDto,
  ListRecurringQueryDto,
  UpdateExpenseDto,
  UpdateRecurringDto,
  VoidExpenseDto,
} from './expenses.dto.js';
import { dueDates, firstDue } from './schedule.js';
import { UploadsService } from '../files/uploads.service.js';

const PROPERTY = { property: { select: { id: true, code: true, name: true } } } as const;
type ExpenseRow = Expense & { property: { id: string; code: string; name: string } };

function snapshot(e: Expense) {
  return {
    propertyId: e.propertyId,
    category: e.category,
    name: e.name,
    payee: e.payee,
    reference: e.reference,
    amount: e.amount,
    incurredOn: formatDateOnly(e.incurredOn),
    receiptUploadId: e.receiptUploadId,
  };
}

function notInFuture(date: string, field: string) {
  if (date > todayInNairobi())
    throw AppError.fieldInvalid(field, 'The date can’t be in the future');
}

/** before = the expense as it counted until now (null if new); after = as it counts from now (null if voided). */
export type ExpenseChangedHook = (
  tx: Tx,
  change: { before: Expense | null; after: Expense | null; userId: string | null },
) => Promise<void>;

/** Property expenses (one-off and generated from recurring ones). Voided, never deleted. */
@Injectable()
export class ExpensesService {
  private readonly log = new Logger(ExpensesService.name);
  private readonly changedHooks: ExpenseChangedHook[] = [];

  /** Later modules follow expenses (agency: deductible from the landlord's payout). */
  onChanged(hook: ExpenseChangedHook): void {
    this.changedHooks.push(hook);
  }

  private async changed(
    tx: Tx,
    before: Expense | null,
    after: Expense | null,
    userId: string | null,
  ) {
    for (const hook of this.changedHooks) await hook(tx, { before, after, userId });
  }

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly properties: PropertiesService,
    private readonly uploads: UploadsService,
  ) {}

  private async view(rows: ExpenseRow[]) {
    const uploadIds = rows.map((r) => r.receiptUploadId).filter((x): x is string => !!x);
    const userIds = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
    const [uploads, users] = await Promise.all([
      uploadIds.length ? this.db.upload.findMany({ where: { id: { in: uploadIds } } }) : [],
      userIds.length
        ? this.db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);
    const up = new Map(uploads.map((u) => [u.id, u]));
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return rows.map((e) => {
      const r = e.receiptUploadId ? up.get(e.receiptUploadId) : undefined;
      return {
        id: e.id,
        property: e.property,
        category: e.category,
        name: e.name,
        payee: e.payee,
        reference: e.reference,
        amount: e.amount,
        incurredOn: formatDateOnly(e.incurredOn),
        receipt: r ? { id: r.id, contentType: r.contentType, size: r.size } : null,
        recurringExpenseId: e.recurringExpenseId,
        voidedAt: e.voidedAt,
        voidReason: e.voidReason,
        createdBy: e.createdById
          ? { id: e.createdById, name: names.get(e.createdById) ?? 'Unknown user' }
          : null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      };
    });
  }

  private where(q: ListExpensesQueryDto): Prisma.ExpenseWhereInput {
    const term = q.q?.trim();
    return {
      AND: [
        { property: propertyScope() },
        q.voided ? { voidedAt: { not: null } } : { voidedAt: null },
        q.propertyId ? { propertyId: q.propertyId } : {},
        q.category ? { category: q.category } : {},
        q.from ? { incurredOn: { gte: parseDateOnly(q.from) } } : {},
        q.to ? { incurredOn: { lte: parseDateOnly(q.to) } } : {},
        term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { payee: { contains: term, mode: 'insensitive' } },
                { reference: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
  }

  async list(q: ListExpensesQueryDto) {
    const where = this.where(q);
    const [rows, total, sum] = await Promise.all([
      this.db.expense.findMany({
        where,
        include: PROPERTY,
        orderBy: [{ incurredOn: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.expense.count({ where }),
      this.db.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      data: await this.view(rows),
      meta: { ...pageMeta(total, q), totalAmount: sum._sum.amount ?? 0n },
    };
  }

  async csv(q: ListExpensesQueryDto): Promise<string> {
    const rows = await this.db.expense.findMany({
      where: this.where(q),
      include: PROPERTY,
      orderBy: [{ incurredOn: 'asc' }, { createdAt: 'asc' }],
      take: 50_000,
    });
    return toCsv(
      [
        'Date',
        'Property',
        'Category',
        'Description',
        'Payee',
        'Reference',
        'Amount (KES)',
        'Voided',
      ],
      rows.map((e) => [
        formatDateOnly(e.incurredOn),
        `${e.property.name} (${e.property.code})`,
        e.category,
        e.name,
        e.payee,
        e.reference,
        e.amount,
        e.voidReason ? `Yes: ${e.voidReason}` : '',
      ]),
    );
  }

  async get(id: string) {
    return (await this.view([await this.find(id)]))[0]!;
  }

  async receiptUploadId(id: string): Promise<string> {
    const e = await this.find(id);
    if (!e.receiptUploadId) throw AppError.notFound('Receipt');
    return e.receiptUploadId;
  }

  async create(dto: CreateExpenseDto) {
    const ctx = orgContext();
    await this.properties.find(dto.propertyId);
    notInFuture(dto.incurredOn, 'incurredOn');
    const row = await this.db.$transaction(async (tx) => {
      if (dto.receiptUploadId)
        await this.uploads.attach(tx, dto.receiptUploadId, 'EXPENSE_RECEIPT', 'receiptUploadId');
      const created = await tx.expense.create({
        data: {
          orgId: ctx.orgId,
          propertyId: dto.propertyId,
          category: dto.category,
          name: dto.name.trim(),
          payee: optionalText(dto.payee) ?? null,
          reference: optionalText(dto.reference) ?? null,
          amount: BigInt(dto.amount),
          incurredOn: parseDateOnly(dto.incurredOn),
          receiptUploadId: dto.receiptUploadId ?? null,
          createdById: ctx.userId,
        },
        include: PROPERTY,
      });
      await this.audit.record(
        {
          action: 'expense.create',
          entity: 'expense',
          entityId: created.id,
          after: snapshot(created),
        },
        tx,
      );
      await this.changed(tx, null, created, ctx.userId);
      return created;
    });
    return (await this.view([row]))[0]!;
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const before = await this.find(id);
    if (before.voidedAt)
      throw AppError.conflict('This expense was voided and can’t change', 'EXPENSE_VOID');
    if (dto.incurredOn) notInFuture(dto.incurredOn, 'incurredOn');
    const row = await this.db.$transaction(async (tx) => {
      const replacing =
        dto.receiptUploadId !== undefined && dto.receiptUploadId !== before.receiptUploadId;
      if (replacing && dto.receiptUploadId) {
        await this.uploads.attach(tx, dto.receiptUploadId, 'EXPENSE_RECEIPT', 'receiptUploadId');
      }
      const updated = await tx.expense.update({
        where: { id },
        data: {
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.payee !== undefined ? { payee: optionalText(dto.payee) } : {}),
          ...(dto.reference !== undefined ? { reference: optionalText(dto.reference) } : {}),
          ...(dto.amount !== undefined ? { amount: BigInt(dto.amount) } : {}),
          ...(dto.incurredOn !== undefined ? { incurredOn: parseDateOnly(dto.incurredOn) } : {}),
          ...(replacing ? { receiptUploadId: dto.receiptUploadId } : {}),
        },
        include: PROPERTY,
      });
      // A replaced receipt is detached so the clean-up job removes the file.
      if (replacing && before.receiptUploadId) {
        await tx.upload.updateMany({
          where: { id: before.receiptUploadId },
          data: { attachedAt: null, createdAt: new Date(0) },
        });
      }
      await this.audit.record(
        {
          action: 'expense.update',
          entity: 'expense',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
        tx,
      );
      await this.changed(tx, before, updated, orgContext().userId);
      return updated;
    });
    return (await this.view([row]))[0]!;
  }

  async void(id: string, dto: VoidExpenseDto) {
    const before = await this.find(id);
    if (before.voidedAt) throw AppError.conflict('This expense was already voided', 'EXPENSE_VOID');
    await this.db.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id },
        data: { voidedAt: new Date(), voidReason: dto.reason.trim() },
      });
      await this.changed(tx, before, null, orgContext().userId);
      await this.audit.record(
        {
          action: 'expense.void',
          entity: 'expense',
          entityId: id,
          before: snapshot(before),
          after: { reason: dto.reason.trim() },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async find(id: string): Promise<ExpenseRow> {
    const e = await this.db.expense.findFirst({
      where: { id, property: propertyScope() },
      include: PROPERTY,
    });
    if (!e) throw AppError.notFound('Expense');
    return e;
  }

  // ── Recurring ──

  private viewRecurring(
    r: RecurringExpense & { property: { id: string; code: string; name: string } },
  ) {
    return {
      id: r.id,
      property: r.property,
      category: r.category,
      name: r.name,
      payee: r.payee,
      amount: r.amount,
      everyMonths: r.everyMonths,
      dayOfMonth: r.dayOfMonth,
      nextDue: formatDateOnly(r.nextDue),
      endDate: r.endDate ? formatDateOnly(r.endDate) : null,
      status: r.status,
      createdAt: r.createdAt,
    };
  }

  async listRecurring(q: ListRecurringQueryDto) {
    const rows = await this.db.recurringExpense.findMany({
      where: {
        property: propertyScope(),
        ...(q.propertyId ? { propertyId: q.propertyId } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      include: PROPERTY,
      orderBy: [{ status: 'asc' }, { nextDue: 'asc' }],
    });
    return rows.map((r) => this.viewRecurring(r));
  }

  async createRecurring(dto: CreateRecurringDto) {
    const ctx = orgContext();
    await this.properties.find(dto.propertyId);
    const { nextDue, dayOfMonth } = firstDue(dto.startDate);
    if (dto.endDate && dto.endDate < nextDue)
      throw AppError.fieldInvalid('endDate', 'The end date must be after the start');
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.recurringExpense.create({
        data: {
          orgId: ctx.orgId,
          propertyId: dto.propertyId,
          category: dto.category,
          name: dto.name.trim(),
          payee: optionalText(dto.payee) ?? null,
          amount: BigInt(dto.amount),
          everyMonths: dto.everyMonths,
          dayOfMonth,
          nextDue: parseDateOnly(nextDue),
          endDate: dto.endDate ? parseDateOnly(dto.endDate) : null,
        },
        include: PROPERTY,
      });
      await this.audit.record(
        {
          action: 'recurring_expense.create',
          entity: 'recurring_expense',
          entityId: created.id,
          after: this.viewRecurring(created),
        },
        tx,
      );
      return created;
    });
    return this.viewRecurring(row);
  }

  async updateRecurring(id: string, dto: UpdateRecurringDto) {
    const before = await this.findRecurring(id);
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.recurringExpense.update({
        where: { id },
        data: {
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.payee !== undefined ? { payee: optionalText(dto.payee) } : {}),
          ...(dto.amount !== undefined ? { amount: BigInt(dto.amount) } : {}),
          ...(dto.everyMonths !== undefined ? { everyMonths: dto.everyMonths } : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate ? parseDateOnly(dto.endDate) : null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: PROPERTY,
      });
      await this.audit.record(
        {
          action: 'recurring_expense.update',
          entity: 'recurring_expense',
          entityId: id,
          before: this.viewRecurring(before),
          after: this.viewRecurring(updated),
        },
        tx,
      );
      return updated;
    });
    return this.viewRecurring(row);
  }

  async removeRecurring(id: string) {
    const before = await this.findRecurring(id);
    if (await this.db.expense.count({ where: { recurringExpenseId: id } })) {
      throw AppError.conflict(
        'Expenses were already generated from this. Mark it inactive instead.',
        'IN_USE',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.recurringExpense.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'recurring_expense.delete',
          entity: 'recurring_expense',
          entityId: id,
          before: this.viewRecurring(before),
        },
        tx,
      );
    });
  }

  private async findRecurring(id: string) {
    const r = await this.db.recurringExpense.findFirst({
      where: { id, property: propertyScope() },
      include: PROPERTY,
    });
    if (!r) throw AppError.notFound('Recurring expense');
    return r;
  }

  /**
   * Creates every expense due by today for the active organisation (catching up missed days).
   * Idempotent: one expense per recurring expense per date.
   */
  async runRecurring(today = todayInNairobi()): Promise<{ created: number }> {
    const due = await this.db.recurringExpense.findMany({
      where: {
        status: 'ACTIVE',
        nextDue: { lte: parseDateOnly(today) },
        property: propertyScope(),
      },
    });
    let created = 0;
    for (const r of due) {
      const { dates, next } = dueDates(r, today);
      await this.db.$transaction(async (tx) => {
        // ON CONFLICT DO NOTHING: a date already generated (double run) is simply skipped.
        const res = await tx.expense.createManyAndReturn({
          data: dates.map((date) => ({
            orgId: r.orgId,
            propertyId: r.propertyId,
            recurringExpenseId: r.id,
            category: r.category,
            name: r.name,
            payee: r.payee,
            amount: r.amount,
            incurredOn: parseDateOnly(date),
            createdById: null,
          })),
          skipDuplicates: true,
        });
        created += res.length;
        for (const e of res) await this.changed(tx, null, e, null);
        await tx.recurringExpense.update({
          where: { id: r.id },
          data: {
            nextDue: parseDateOnly(next),
            ...(r.endDate && next > formatDateOnly(r.endDate) ? { status: 'INACTIVE' } : {}),
          },
        });
      });
    }
    return { created };
  }

  /** Scheduled, every organisation. */
  async runRecurringAll() {
    const orgs = await this.prisma.organization.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true },
    });
    let created = 0;
    for (const o of orgs) {
      try {
        created += (await runWithContext(emptyContext({ orgId: o.id }), () => this.runRecurring()))
          .created;
      } catch (e) {
        this.log.error({ err: e, orgId: o.id }, 'Recurring expenses failed for an organisation');
      }
    }
    return { organizations: orgs.length, created };
  }
}
