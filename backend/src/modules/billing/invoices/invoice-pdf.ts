import {
  a4,
  DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS,
  drawInstructionsAndSignoff,
  footer,
  header,
  money,
  PDF_BRAND,
  type StatusBadgeOptions,
} from '../../../common/pdf/pdf.js';
import type { InvoicesService } from './invoices.service.js';

type PdfInput = Awaited<ReturnType<InvoicesService['forPdf']>> & {
  instructions?: {
    org?: string | null;
    system?: string | null;
  };
};

export { money };

const KIND_TITLE = {
  MONTHLY: 'Invoice',
  MOVE_IN: 'Move-in invoice',
  ADHOC: 'Invoice',
} as const;

const KIND_SUBTITLE = {
  MONTHLY: 'Monthly Rent & Utilities',
  MOVE_IN: 'Move-In Charges & Deposit',
  ADHOC: 'One-Off / Adjustment Invoice',
} as const;

function statusBadgeFor(status: string, overdue?: boolean): StatusBadgeOptions {
  if (status === 'PAID') return { label: 'Paid in full', tone: 'success' };
  if (status === 'VOID') return { label: 'Voided', tone: 'danger' };
  if (overdue) return { label: 'Overdue', tone: 'danger' };
  if (status === 'PARTIALLY_PAID') return { label: 'Partially paid', tone: 'warning' };
  return { label: 'Issued · Payment due', tone: 'neutral' };
}

/**
 * Renders an institutional A4 Tenant Invoice PDF.
 * Uses built-in Helvetica / Helvetica-Bold only so no external font files ship in the image.
 */
export function renderInvoicePdf({
  invoice: i,
  org,
  channels,
  instructions,
}: PdfInput): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(i.number, org.name);
  const width = right - left;

  const badge = statusBadgeFor(i.status, i.overdue);
  const yAfterHeader = header(
    doc,
    org,
    i.status === 'VOID' ? `${KIND_TITLE[i.kind]} - VOID` : KIND_TITLE[i.kind],
    [
      ['Invoice No.', i.number],
      ['Issued', i.issueDate],
      ['Due Date', i.dueDate],
      ['Period', i.period],
    ],
    badge,
  );

  // Two-column sharp bordered accounting summary grid: BILL TO (left) and PROPERTY & UNIT (right)
  const gridTop = yAfterHeader;
  const gridHeight = 76;
  const halfWidth = width / 2;

  doc.save();
  doc
    .rect(left, gridTop, width, gridHeight)
    .lineWidth(0.75)
    .fillAndStroke('#FFFFFF', PDF_BRAND.borderStrong);
  doc
    .moveTo(left + halfWidth, gridTop)
    .lineTo(left + halfWidth, gridTop + gridHeight)
    .lineWidth(0.6)
    .strokeColor(PDF_BRAND.border)
    .stroke();
  doc.restore();

  const padX = 12;
  const colW = halfWidth - padX * 2;

  // Left cell: Bill To
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('BILLED TO', left + padX, gridTop + 10, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(
      `${i.tenant.firstName} ${i.tenant.lastName} (${i.tenant.code})`,
      left + padX,
      gridTop + 22,
      { width: colW },
    );
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(`Tel: ${i.tenant.phone}`, left + padX, doc.y + 2, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PDF_BRAND.ink)
    .text(`Account / Payment Ref: ${i.tenant.code}`, left + padX, doc.y + 2, { width: colW });

  // Right cell: Property & Unit
  const rightBoxX = left + halfWidth + padX;
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('PROPERTY & UNIT', rightBoxX, gridTop + 10, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(`Unit ${i.unit.number}, ${i.property.name}`, rightBoxX, gridTop + 22, { width: colW });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(`Billing Type: ${KIND_SUBTITLE[i.kind]}`, rightBoxX, doc.y + 2, { width: colW });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(`Billing Period: ${i.period}  |  Due Date: ${i.dueDate}`, rightBoxX, doc.y + 2, {
      width: colW,
    });

  // Line items table
  let y = gridTop + gridHeight + 16;
  const cols = {
    desc: left + 8,
    qty: left + 275,
    unit: left + 335,
    amount: left + 415,
  };

  const headerBarH = 22;
  doc.save();
  doc.rect(left, y, width, headerBarH).fill(PDF_BRAND.tableHeaderBg);
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(PDF_BRAND.ruleHeavy).stroke();
  doc
    .moveTo(left, y + headerBarH)
    .lineTo(right, y + headerBarH)
    .lineWidth(0.75)
    .strokeColor(PDF_BRAND.ruleHeavy)
    .stroke();
  doc.restore();

  const headerTextY = y + 7;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND.tableHeaderFg);
  doc.text('Description', cols.desc, headerTextY, { width: 255, lineBreak: false });
  doc.text('Qty', cols.qty, headerTextY, { width: 52, align: 'right', lineBreak: false });
  doc.text('Unit price', cols.unit, headerTextY, { width: 72, align: 'right', lineBreak: false });
  doc.text('Amount (KES)', cols.amount, headerTextY, {
    width: right - 8 - cols.amount,
    align: 'right',
    lineBreak: false,
  });

  y += headerBarH;

  for (let idx = 0; idx < i.lines.length; idx++) {
    const l = i.lines[idx]!;
    const qty = l.quantity.replace(/\.?0+$/, '') || '0';
    const descText = l.description + (l.refundable ? ' (refundable)' : '');

    doc.font('Helvetica').fontSize(9);
    const descHeight = doc.heightOfString(descText, { width: 255 });
    const rowHeight = Math.max(descHeight + 12, 22);

    if (idx % 2 === 1) {
      doc.save();
      doc.rect(left, y, width, rowHeight).fill(PDF_BRAND.tableZebraBg);
      doc.restore();
    }

    const rowTextY = y + 6;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PDF_BRAND.ink)
      .text(descText, cols.desc, rowTextY, { width: 255 });
    doc
      .fillColor(PDF_BRAND.inkSecondary)
      .text(qty, cols.qty, rowTextY, { width: 52, align: 'right', lineBreak: false });
    doc.text(money(l.unitAmount), cols.unit, rowTextY, {
      width: 72,
      align: 'right',
      lineBreak: false,
    });
    doc
      .font('Helvetica-Bold')
      .fillColor(PDF_BRAND.ink)
      .text(money(l.amount), cols.amount, rowTextY, {
        width: right - 8 - cols.amount,
        align: 'right',
        lineBreak: false,
      });

    y += rowHeight;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
  }

  // Right-aligned Totals block
  y += 12;
  const totalsWidth = 210;
  const totalsX = right - totalsWidth;
  let totalsY = y;

  const summaryRows: [string, bigint][] = [['Total', i.total]];
  if (i.creditedAmount > 0n) summaryRows.push(['Credited', -i.creditedAmount]);
  if (i.amountPaid > 0n) summaryRows.push(['Paid', -i.amountPaid]);

  for (const [label, value] of summaryRows) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(label, totalsX, totalsY, { width: 95, align: 'left', lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PDF_BRAND.ink)
      .text(`KES ${money(value)}`, totalsX + 100, totalsY, {
        width: totalsWidth - 100,
        align: 'right',
        lineBreak: false,
      });
    totalsY += 15;
  }

  totalsY += 4;
  const balBoxH = 26;
  doc.save();
  doc
    .rect(totalsX, totalsY, totalsWidth, balBoxH)
    .lineWidth(1)
    .fillAndStroke(PDF_BRAND.brandSoft, PDF_BRAND.ruleHeavy);
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(PDF_BRAND.ink)
    .text('Balance due', totalsX + 8, totalsY + 8, {
      width: 90,
      align: 'left',
      lineBreak: false,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PDF_BRAND.ink)
    .text(`KES ${money(i.balance)}`, totalsX + 100, totalsY + 7.5, {
      width: totalsWidth - 108,
      align: 'right',
      lineBreak: false,
    });

  let afterSummaryY = totalsY + balBoxH + 14;

  if (i.creditNotes.length) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(
        `Credit notes: ${i.creditNotes.map((c) => `${c.number} ${money(c.amount)} - ${c.reason}`).join('; ')}`,
        left,
        afterSummaryY,
        { width },
      );
    afterSummaryY = doc.y + 8;
  }

  if (i.status === 'VOID' && i.voidReason) {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PDF_BRAND.dangerText)
      .text(`Voided: ${i.voidReason}`, left, afterSummaryY, { width });
    afterSummaryY = doc.y + 10;
  }

  // Payment methods + Organisation Instructions + System Instructions
  const payLines: string[] = [];
  for (const c of channels) {
    if (c.kind === 'MPESA_PAYBILL' && c.shortcode) {
      payLines.push(`M-Pesa Paybill: ${c.shortcode}  |  Account: ${i.tenant.code}`);
    } else if (c.kind === 'MPESA_TILL' && c.shortcode) {
      payLines.push(`M-Pesa Buy Goods Till: ${c.shortcode}  |  Ref: ${i.tenant.code}`);
    } else if (c.kind === 'BANK_ACCOUNT' && c.accountNumber) {
      payLines.push(
        `${c.bankName || c.name}: Acc ${c.accountNumber}${c.accountName ? ` (${c.accountName})` : ''}  |  Ref: ${i.tenant.code}`,
      );
    }
  }
  if (payLines.length === 0) {
    payLines.push(`Quote tenant reference ${i.tenant.code} on all rent & utility payments.`);
  }

  drawInstructionsAndSignoff(doc, afterSummaryY, {
    orgName: org.name,
    extraTitle: 'How to pay',
    extraLines: payLines,
    orgInstructions: instructions?.org ?? null,
    systemInstructions: instructions?.system ?? DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS,
    signoffLeft: `Issued by ${org.name}`,
    signoffCenter: `Tenant Ref: ${i.tenant.code}`,
    signoffRight: `Invoice: ${i.number}`,
  });

  footer(doc, `Please quote ${i.tenant.code} when paying.`, i.number);
  doc.end();
  return bytes;
}
