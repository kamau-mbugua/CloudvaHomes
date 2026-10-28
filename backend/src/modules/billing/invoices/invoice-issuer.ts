import { Injectable } from '@nestjs/common';
import { formatDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import type { InvoiceKind } from '../../../generated/prisma/client.js';
import type { Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { nextCode } from '../../portfolio/codes.js';
import { addDays } from '../billing-math.js';
import type { DraftLine } from './invoice-builder.js';

export interface IssueRequest {
  orgId: string;
  tenancy: { id: string; tenantId: string; unitId: string; unit: { propertyId: string } };
  kind: InvoiceKind;
  period: string;
  issueDate: Date;
  /** Overrides issue date + the organisation's due days. */
  dueDate?: Date;
  lines: DraftLine[];
  createdById: string | null;
}

export type IssuedHook = (
  tx: Tx,
  invoice: { id: string; orgId: string; tenantId: string; createdById: string | null },
) => Promise<void>;

/**
 * The only code that writes invoices. Numbers it, dates it, writes its lines and locks the
 * meter readings and variable entries it used — all in the caller's transaction.
 */
@Injectable()
export class InvoiceIssuer {
  private readonly issuedHooks: IssuedHook[] = [];

  constructor(private readonly audit: AuditService) {}

  /** Lets later modules act in the issuing transaction (payments applies tenant credit). */
  onIssued(hook: IssuedHook): void {
    this.issuedHooks.push(hook);
  }

  async issue(tx: Tx, r: IssueRequest): Promise<string> {
    if (!r.lines.length) throw new Error('An invoice needs at least one line');
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: r.orgId },
      select: { invoiceDueDays: true },
    });
    const year = formatDateOnly(r.issueDate).slice(0, 4);
    const total = r.lines.reduce((sum, l) => sum + l.amount, 0n);
    const invoice = await tx.invoice.create({
      data: {
        orgId: r.orgId,
        number: await nextCode(tx, r.orgId, `invoice:${year}`, `INV-${year}-`, 6),
        tenancyId: r.tenancy.id,
        tenantId: r.tenancy.tenantId,
        unitId: r.tenancy.unitId,
        propertyId: r.tenancy.unit.propertyId,
        period: r.period,
        kind: r.kind,
        issueDate: r.issueDate,
        dueDate: r.dueDate ?? addDays(r.issueDate, org.invoiceDueDays),
        total,
        status: total === 0n ? 'PAID' : 'ISSUED',
        createdById: r.createdById,
      },
    });
    await tx.invoiceLine.createMany({
      data: r.lines.map((l, position) => ({
        orgId: r.orgId,
        invoiceId: invoice.id,
        position,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        amount: l.amount,
        refundable: l.refundable ?? false,
        chargeTypeId: l.chargeTypeId ?? null,
        moveInChargeId: l.moveInChargeId ?? null,
        meterReadingId: l.meterReadingId ?? null,
        chargeEntryId: l.chargeEntryId ?? null,
      })),
    });
    // Lock the inputs. A count mismatch means another invoice took them first.
    const readingIds = r.lines.flatMap((l) => (l.meterReadingId ? [l.meterReadingId] : []));
    const entryIds = r.lines.flatMap((l) => (l.chargeEntryId ? [l.chargeEntryId] : []));
    if (readingIds.length) {
      const { count } = await tx.meterReading.updateMany({
        where: { id: { in: readingIds }, invoiceId: null },
        data: { invoiceId: invoice.id },
      });
      if (count !== readingIds.length) throw billedMeanwhile();
    }
    if (entryIds.length) {
      const { count } = await tx.chargeEntry.updateMany({
        where: { id: { in: entryIds }, invoiceId: null },
        data: { invoiceId: invoice.id },
      });
      if (count !== entryIds.length) throw billedMeanwhile();
    }
    await this.audit.record(
      {
        action: 'invoice.issue',
        entity: 'invoice',
        entityId: invoice.id,
        after: {
          number: invoice.number,
          kind: r.kind,
          period: r.period,
          tenancyId: r.tenancy.id,
          total,
          lines: r.lines.map((l) => ({
            kind: l.kind,
            description: l.description,
            amount: l.amount,
          })),
        },
        orgId: r.orgId,
        actorId: r.createdById,
      },
      tx,
    );
    for (const hook of this.issuedHooks) await hook(tx, invoice);
    return invoice.id;
  }
}

const billedMeanwhile = () =>
  AppError.conflict('Some figures were billed by another invoice just now. Try again.', 'CONFLICT');
