import { Injectable, Logger, Optional } from '@nestjs/common';
import { formatDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import {
  readOrgDocumentInstructions,
  readSystemDocumentInstructions,
} from '../../../common/pdf/pdf.js';
import type { InvoiceKind } from '../../../generated/prisma/client.js';
import type { Tx } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { formatKesMinor, NotificationsService } from '../../notifications/notifications.service.js';
import { nextCode } from '../../portfolio/codes.js';
import { addDays, balanceOf } from '../billing-math.js';
import type { DraftLine } from './invoice-builder.js';
import { renderInvoicePdf } from './invoice-pdf.js';

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
  private readonly logger = new Logger(InvoiceIssuer.name);
  private readonly issuedHooks: IssuedHook[] = [];

  constructor(
    private readonly audit: AuditService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

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
    await this.notifyTenantInvoice(tx, invoice.id, r);
    return invoice.id;
  }

  private async notifyTenantInvoice(tx: Tx, invoiceId: string, r: IssueRequest): Promise<void> {
    if (!this.notifications) return;
    try {
      const [fullInvoice, org, channels, platformSettings] = await Promise.all([
        tx.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            lines: { orderBy: { position: 'asc' } },
            tenancy: {
              select: {
                id: true,
                tenant: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    code: true,
                  },
                },
                unit: {
                  select: {
                    id: true,
                    number: true,
                    property: { select: { id: true, name: true, code: true } },
                  },
                },
              },
            },
          },
        }),
        tx.organization.findUnique({
          where: { id: r.orgId },
          select: { name: true, phone: true, email: true, kraPin: true, settings: true },
        }),
        tx.paymentChannel.findMany({
          where: {
            orgId: r.orgId,
            status: 'ACTIVE',
            kind: { in: ['MPESA_PAYBILL', 'MPESA_TILL', 'BANK_ACCOUNT'] },
            OR: [
              { propertyIds: { isEmpty: true } },
              { propertyIds: { has: r.tenancy.unit.propertyId } },
            ],
          },
          orderBy: { createdAt: 'asc' },
        }),
        tx.platformSettings.findUnique({
          where: { id: 1 },
          select: { emailTemplates: true },
        }),
      ]);

      const tenant = fullInvoice?.tenancy.tenant;
      if (!fullInvoice || !tenant?.email) return;

      const unit = fullInvoice.tenancy.unit;
      const orgName = org?.name ?? 'KodiHub';
      const kindLabel =
        r.kind === 'MOVE_IN' ? 'Move-in' : r.kind === 'ADHOC' ? 'Ad-hoc / Adjustment' : 'Monthly';

      const linesSummary = r.lines
        .map((l) => `- ${l.description}: KES ${formatKesMinor(l.amount)}`)
        .join('\n');

      const paidAndCredited = fullInvoice.amountPaid + fullInvoice.creditedAmount;
      const bal = balanceOf(fullInvoice);

      const payLines: string[] = [];
      for (const c of channels) {
        if (c.kind === 'MPESA_PAYBILL' && c.shortcode) {
          payLines.push(`M-Pesa Paybill ${c.shortcode}, Account ${tenant.code}`);
        } else if (c.kind === 'MPESA_TILL' && c.shortcode) {
          payLines.push(`M-Pesa Buy Goods Till ${c.shortcode}`);
        } else if (c.kind === 'BANK_ACCOUNT' && c.accountNumber) {
          payLines.push(
            `${c.bankName || c.name} Acc ${c.accountNumber}${c.accountName ? ` (${c.accountName})` : ''}, Ref ${tenant.code}`,
          );
        }
      }
      const paymentInstructions =
        payLines.length > 0
          ? `Pay via ${payLines.join(' or ')}.`
          : `Use your tenant account code ${tenant.code} when paying.`;

      const issueDateStr = formatDateOnly(fullInvoice.issueDate);
      const dueDateStr = formatDateOnly(fullInvoice.dueDate);
      const pdfBuffer = await renderInvoicePdf({
        invoice: {
          id: fullInvoice.id,
          number: fullInvoice.number,
          kind: fullInvoice.kind,
          status: fullInvoice.status,
          period: fullInvoice.period,
          issueDate: issueDateStr,
          dueDate: dueDateStr,
          overdue: false,
          total: fullInvoice.total,
          amountPaid: fullInvoice.amountPaid,
          creditedAmount: fullInvoice.creditedAmount,
          balance: bal,
          voidedAt: fullInvoice.voidedAt,
          voidReason: fullInvoice.voidReason,
          tenancyId: fullInvoice.tenancy.id,
          tenant: {
            id: tenant.id,
            code: tenant.code,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone,
          },
          unit: { id: unit.id, number: unit.number },
          property: {
            id: unit.property.id,
            code: unit.property.code,
            name: unit.property.name,
          },
          createdAt: fullInvoice.createdAt,
          lines: fullInvoice.lines.map((l) => ({
            id: l.id,
            kind: l.kind,
            description: l.description,
            quantity: l.quantity.toFixed(3),
            unitAmount: l.unitAmount,
            amount: l.amount,
            refundable: l.refundable,
          })),
          creditNotes: [],
          payments: [],
        },
        org: {
          name: orgName,
          phone: org?.phone ?? '',
          email: org?.email ?? '',
          kraPin: org?.kraPin ?? null,
        },
        channels: channels.map((c) => ({
          name: c.name,
          kind: c.kind,
          shortcode: c.shortcode,
          bankName: c.bankName,
          accountNumber: c.accountNumber,
          accountName: c.accountName,
        })),
        instructions: {
          org: readOrgDocumentInstructions(org?.settings).invoiceInstructions,
          system: readSystemDocumentInstructions(platformSettings?.emailTemplates)
            .invoiceInstructions,
        },
      });

      await this.notifications.sendTenantInvoiceIssued(
        { email: tenant.email, phone: tenant.phone },
        {
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          organizationName: orgName,
          tenantCode: tenant.code,
          invoiceNumber: fullInvoice.number,
          invoiceKind: kindLabel,
          period: fullInvoice.period,
          propertyName: unit.property.name,
          unitNumber: unit.number,
          issueDate: issueDateStr,
          dueDate: dueDateStr,
          linesSummary,
          totalKes: formatKesMinor(fullInvoice.total),
          amountPaidKes: formatKesMinor(paidAndCredited),
          balanceKes: formatKesMinor(bal > 0n ? bal : 0n),
          paymentInstructions,
          pdfBuffer,
        },
      );
    } catch (err) {
      this.logger.warn({ err, invoiceId }, 'Could not send tenant invoice email');
    }
  }
}

const billedMeanwhile = () =>
  AppError.conflict('Some figures were billed by another invoice just now. Try again.', 'CONFLICT');
