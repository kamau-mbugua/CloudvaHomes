import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import {
  readOrgDocumentInstructions,
  readSystemDocumentInstructions,
} from '../../../common/pdf/pdf.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { nextCode } from '../../portfolio/codes.js';
import { tenancyScope } from '../../portfolio/property-scope.js';
import { balanceOf, invoiceStatus, periodOf, todayInNairobi } from '../billing-math.js';
import { InvoiceBuilder } from './invoice-builder.js';
import { InvoiceIssuer } from './invoice-issuer.js';
import { LIVE_INVOICE_INDEX } from './invoice-run.service.js';
import type {
  CreateAdhocInvoiceDto,
  CreateCreditNoteDto,
  ListInvoicesQueryDto,
  VoidInvoiceDto,
} from './invoices.dto.js';

const LIST_INCLUDE = {
  tenancy: {
    select: {
      tenant: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
      unit: {
        select: {
          id: true,
          number: true,
          property: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  lines: { orderBy: { position: 'asc' } },
  creditNotes: { orderBy: { createdAt: 'asc' } },
  allocations: {
    orderBy: { createdAt: 'asc' },
    include: {
      payment: { select: { id: true, number: true, method: true, receivedAt: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;

type ListRow = Prisma.InvoiceGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.InvoiceGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const TENANCY_FOR_ISSUE = {
  id: true,
  tenantId: true,
  unitId: true,
  rentAmount: true,
  status: true,
  startDate: true,
  unit: { select: { propertyId: true } },
} as const;

export function toInvoice(i: ListRow, today = todayInNairobi()) {
  const balance = balanceOf(i);
  const due = formatDateOnly(i.dueDate);
  return {
    id: i.id,
    number: i.number,
    kind: i.kind,
    period: i.period,
    status: i.status,
    issueDate: formatDateOnly(i.issueDate),
    dueDate: due,
    total: i.total,
    amountPaid: i.amountPaid,
    creditedAmount: i.creditedAmount,
    balance: i.status === 'VOID' ? 0n : balance,
    overdue: i.status !== 'VOID' && balance > 0n && due < today,
    tenant: i.tenancy.tenant,
    unit: { id: i.tenancy.unit.id, number: i.tenancy.unit.number },
    property: i.tenancy.unit.property,
    tenancyId: i.tenancyId,
    voidedAt: i.voidedAt,
    voidReason: i.voidReason,
    createdAt: i.createdAt,
  };
}

export type VoidedHook = (tx: Tx, invoice: { id: string; orgId: string }) => Promise<void>;

@Injectable()
export class InvoicesService {
  private readonly voidedHooks: VoidedHook[] = [];

  /** Later modules undo what they booked at issue (agency: invoiced-basis commission). */
  onVoided(hook: VoidedHook): void {
    this.voidedHooks.push(hook);
  }

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly builder: InvoiceBuilder,
    private readonly issuer: InvoiceIssuer,
  ) {}

  async list(q: ListInvoicesQueryDto) {
    const term = q.q?.trim();
    const today = todayInNairobi();
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        { tenancy: tenancyScope() },
        q.status ? { status: q.status } : {},
        q.kind ? { kind: q.kind } : {},
        q.period ? { period: q.period } : {},
        q.propertyId ? { propertyId: q.propertyId } : {},
        q.tenantId ? { tenantId: q.tenantId } : {},
        q.tenancyId ? { tenancyId: q.tenancyId } : {},
        q.unitId ? { unitId: q.unitId } : {},
        q.overdue
          ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: parseDateOnly(today) } }
          : {},
        term
          ? {
              OR: [
                { number: { contains: term, mode: 'insensitive' } },
                {
                  tenancy: {
                    OR: [
                      { unit: { number: { contains: term, mode: 'insensitive' } } },
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
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.invoice.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.invoice.count({ where }),
    ]);
    return paginated(
      rows.map((r) => toInvoice(r, today)),
      total,
      q,
    );
  }

  async get(id: string) {
    return this.toDetail(await this.find(id));
  }

  /** The invoice with everything the PDF needs. */
  async forPdf(id: string) {
    const i = await this.find(id);
    const [org, channels, platformSettings] = await Promise.all([
      this.db.organization.findUniqueOrThrow({
        where: { id: i.orgId },
        select: { name: true, phone: true, email: true, kraPin: true, settings: true },
      }),
      this.db.paymentChannel.findMany({
        where: {
          orgId: i.orgId,
          status: 'ACTIVE',
          kind: { in: ['MPESA_PAYBILL', 'MPESA_TILL', 'BANK_ACCOUNT'] },
          OR: [
            { propertyIds: { isEmpty: true } },
            { propertyIds: { has: i.tenancy.unit.property.id } },
          ],
        },
        select: {
          name: true,
          kind: true,
          shortcode: true,
          bankName: true,
          accountNumber: true,
          accountName: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.platformSettings.findUnique({
        where: { id: 1 },
        select: { emailTemplates: true },
      }),
    ]);
    const orgDocs = readOrgDocumentInstructions(org.settings);
    const sysDocs = readSystemDocumentInstructions(platformSettings?.emailTemplates);
    return {
      invoice: await this.toDetail(i),
      org: { name: org.name, phone: org.phone, email: org.email, kraPin: org.kraPin },
      channels,
      instructions: {
        org: orgDocs.invoiceInstructions,
        system: sysDocs.invoiceInstructions,
      },
    };
  }

  private async toDetail(i: DetailRow) {
    const userIds = [...new Set(i.creditNotes.map((c) => c.createdById))];
    const users = userIds.length
      ? await this.db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return {
      ...toInvoice(i),
      lines: i.lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity.toFixed(3),
        unitAmount: l.unitAmount,
        amount: l.amount,
        refundable: l.refundable,
      })),
      creditNotes: i.creditNotes.map((c) => ({
        id: c.id,
        number: c.number,
        amount: c.amount,
        reason: c.reason,
        createdAt: c.createdAt,
        createdBy: { id: c.createdById, name: names.get(c.createdById) ?? 'Unknown user' },
      })),
      payments: i.allocations.map((a) => ({
        id: a.payment.id,
        number: a.payment.number,
        method: a.payment.method,
        receivedAt: formatDateOnly(a.payment.receivedAt),
        amount: a.amount,
      })),
    };
  }

  /** One-off invoice with free-text lines (repairs, damages, penalties). */
  async createAdhoc(dto: CreateAdhocInvoiceDto) {
    const ctx = orgContext();
    const tenancy = await this.findTenancy(dto.tenancyId);
    const today = todayInNairobi();
    const id = await this.db.$transaction((tx) =>
      this.issuer.issue(tx, {
        orgId: ctx.orgId,
        tenancy,
        kind: 'ADHOC',
        period: periodOf(today),
        issueDate: parseDateOnly(today),
        dueDate: dto.dueDate ? parseDateOnly(dto.dueDate) : undefined,
        lines: dto.lines.map((l) => ({
          kind: 'ADJUSTMENT',
          description: l.description.trim(),
          quantity: '1.000',
          unitAmount: BigInt(l.amount),
          amount: BigInt(l.amount),
        })),
        createdById: ctx.userId,
      }),
    );
    return this.get(id);
  }

  /** The move-in invoice for an existing tenancy (when it wasn't issued at move-in). */
  async createMoveIn(tenancyId: string) {
    const tenancy = await this.findTenancy(tenancyId);
    const id = await this.db.$transaction((tx) => this.issueMoveInInTx(tx, tenancy, true));
    return this.get(id!);
  }

  /**
   * Issues the MOVE_IN invoice inside the caller's transaction (move-in uses this too).
   * Returns null when the property has no move-in charges and `required` is false.
   */
  async issueMoveInInTx(
    tx: Tx,
    tenancy: {
      id: string;
      tenantId: string;
      unitId: string;
      rentAmount: bigint;
      startDate: Date;
      unit: { propertyId: string };
    },
    required: boolean,
  ): Promise<string | null> {
    const ctx = orgContext();
    const lines = await this.builder.moveIn(tenancy.unit.propertyId, tenancy.rentAmount, tx);
    if (!lines.length) {
      if (!required) return null;
      throw new AppError(422, 'NO_MOVE_IN_CHARGES', 'This property has no move-in charges set up');
    }
    const existing = await tx.invoice.count({
      where: { tenancyId: tenancy.id, kind: 'MOVE_IN', status: { not: 'VOID' } },
    });
    if (existing) throw alreadyInvoiced();
    const today = todayInNairobi();
    try {
      return await this.issuer.issue(tx, {
        orgId: ctx.orgId,
        tenancy,
        kind: 'MOVE_IN',
        period: periodOf(formatDateOnly(tenancy.startDate)),
        issueDate: parseDateOnly(today),
        lines,
        createdById: ctx.userId,
      });
    } catch (e) {
      if (violatesUnique(e, LIVE_INVOICE_INDEX)) throw alreadyInvoiced();
      throw e;
    }
  }

  /** Only with nothing paid or credited. Frees its readings and variable entries for re-billing. */
  async void(id: string, dto: VoidInvoiceDto) {
    const before = await this.find(id);
    if (before.status === 'VOID') throw invoiceVoid();
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: { id, status: { not: 'VOID' }, amountPaid: 0n, creditedAmount: 0n },
        data: { status: 'VOID', voidedAt: new Date(), voidReason: dto.reason.trim() },
      });
      if (!count) {
        throw AppError.conflict(
          'Money has been paid or credited against this invoice, so it can’t be voided. Issue a credit note instead.',
          'INVOICE_SETTLED',
        );
      }
      for (const hook of this.voidedHooks) await hook(tx, { id, orgId: before.orgId });
      await tx.meterReading.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
      await tx.chargeEntry.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
      await this.audit.record(
        {
          action: 'invoice.void',
          entity: 'invoice',
          entityId: id,
          before: { number: before.number, status: before.status, total: before.total },
          after: { status: 'VOID', reason: dto.reason.trim() },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async creditNote(id: string, dto: CreateCreditNoteDto) {
    const ctx = orgContext();
    const before = await this.find(id);
    if (before.status === 'VOID') throw invoiceVoid();
    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw AppError.fieldInvalid('amount', 'Enter an amount above zero');
    await this.db.$transaction(async (tx) => {
      // Re-read under a row lock so two credit notes can't both fit the same balance.
      await tx.$queryRaw`SELECT 1 FROM "invoices" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (amount > balanceOf(inv)) {
        throw AppError.fieldInvalid('amount', 'A credit note can’t be more than the balance');
      }
      const year = todayInNairobi().slice(0, 4);
      const note = await tx.creditNote.create({
        data: {
          orgId: ctx.orgId,
          number: await nextCode(tx, ctx.orgId, `credit-note:${year}`, `CN-${year}-`, 6),
          invoiceId: id,
          amount,
          reason: dto.reason.trim(),
          createdById: ctx.userId,
        },
      });
      const credited = inv.creditedAmount + amount;
      await tx.invoice.update({
        where: { id },
        data: {
          creditedAmount: credited,
          status: invoiceStatus(inv.total, inv.amountPaid, credited),
        },
      });
      await this.audit.record(
        {
          action: 'invoice.credit_note',
          entity: 'invoice',
          entityId: id,
          after: { creditNote: note.number, amount, reason: note.reason },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async find(id: string): Promise<DetailRow> {
    const i = await this.db.invoice.findFirst({
      where: { id, tenancy: tenancyScope() },
      include: DETAIL_INCLUDE,
    });
    if (!i) throw AppError.notFound('Invoice');
    return i;
  }

  private async findTenancy(id: string) {
    const t = await this.db.tenancy.findFirst({
      where: { AND: [{ id }, tenancyScope()] },
      select: TENANCY_FOR_ISSUE,
    });
    if (!t) throw AppError.notFound('Tenancy');
    return t;
  }
}

const alreadyInvoiced = () =>
  AppError.conflict('This tenancy already has a move-in invoice', 'ALREADY_INVOICED');
const invoiceVoid = () => AppError.conflict('This invoice has been voided', 'INVOICE_VOID');
