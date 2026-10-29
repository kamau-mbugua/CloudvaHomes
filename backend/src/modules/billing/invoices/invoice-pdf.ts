import {
  a4,
  footer,
  header,
  money,
  PDF_BRAND,
  type StatusBadgeOptions,
} from '../../../common/pdf/pdf.js';
import type { InvoicesService } from './invoices.service.js';

type PdfInput = Awaited<ReturnType<InvoicesService['forPdf']>>;

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
 * Renders a branded A4 Tenant Invoice PDF.
 * Uses built-in Helvetica / Helvetica-Bold only so no external font files ship in the image.
 */
export function renderInvoicePdf({ invoice: i, org, channels }: PdfInput): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(i.number, org.name);
  const width = right - left;

  const badge = statusBadgeFor(i.status, i.overdue);
  const yAfterHeader = header(
    doc,
    org,
    i.status === 'VOID' ? `${KIND_TITLE[i.kind]} - VOID` : KIND_TITLE[i.kind],
    [
      ['Number', i.number],
      ['Issued', i.issueDate],
      ['Due', i.dueDate],
      ['Period', i.period],
    ],
    badge,
  );

  // Two-column info card: BILL TO (left) and PROPERTY & UNIT (right)
  const cardTop = yAfterHeader + 2;
  const cardHeight = 76;
  const colGap = 14;
  const colWidth = (width - colGap) / 2;

  doc.save();
  doc
    .roundedRect(left, cardTop, colWidth, cardHeight, 6)
    .fillAndStroke(PDF_BRAND.surface, PDF_BRAND.border);
  doc
    .roundedRect(left + colWidth + colGap, cardTop, colWidth, cardHeight, 6)
    .fillAndStroke(PDF_BRAND.surface, PDF_BRAND.border);
  doc.restore();

  // Left box: Bill To
  const padX = 12;
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.brandAccent)
    .text('BILL TO', left + padX, cardTop + 10, { width: colWidth - padX * 2 });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(
      `${i.tenant.firstName} ${i.tenant.lastName} (${i.tenant.code})`,
      left + padX,
      cardTop + 23,
      {
        width: colWidth - padX * 2,
      },
    );
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(`Tel: ${i.tenant.phone}`, left + padX, doc.y + 2, { width: colWidth - padX * 2 });
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PDF_BRAND.brandDark)
    .text(`Account / Payment Ref: ${i.tenant.code}`, left + padX, doc.y + 2, {
      width: colWidth - padX * 2,
    });

  // Right box: Property & Unit
  const rightBoxX = left + colWidth + colGap + padX;
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.brandAccent)
    .text('PROPERTY & UNIT', rightBoxX, cardTop + 10, { width: colWidth - padX * 2 });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(`Unit ${i.unit.number}, ${i.property.name}`, rightBoxX, cardTop + 23, {
      width: colWidth - padX * 2,
    });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(`Billing Type: ${KIND_SUBTITLE[i.kind]}`, rightBoxX, doc.y + 2, {
      width: colWidth - padX * 2,
    });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(`Billing Period: ${i.period}  |  Due Date: ${i.dueDate}`, rightBoxX, doc.y + 2, {
      width: colWidth - padX * 2,
    });

  // Line items table
  let y = cardTop + cardHeight + 18;
  const cols = {
    desc: left + 10,
    qty: left + 275,
    unit: left + 335,
    amount: left + 415,
  };

  // Dark branded table header bar
  const headerBarH = 22;
  doc.save();
  doc.roundedRect(left, y, width, headerBarH, 4).fill(PDF_BRAND.tableHeaderBg);
  doc.restore();

  const headerTextY = y + 6.5;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
  doc.text('Description', cols.desc, headerTextY, { width: 255, lineBreak: false });
  doc.text('Qty', cols.qty, headerTextY, { width: 52, align: 'right', lineBreak: false });
  doc.text('Unit price', cols.unit, headerTextY, { width: 72, align: 'right', lineBreak: false });
  doc.text('Amount (KES)', cols.amount, headerTextY, {
    width: right - 10 - cols.amount,
    align: 'right',
    lineBreak: false,
  });

  y += headerBarH;

  // Table rows with zebra striping
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
        width: right - 10 - cols.amount,
        align: 'right',
        lineBreak: false,
      });

    y += rowHeight;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
  }

  // Totals & Payment Instructions side-by-side below table
  y += 14;
  const summaryStartY = y;

  // Left side: How to pay box
  const payBoxWidth = width * 0.54;
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

  const payBoxHeight = Math.max(46, 28 + payLines.length * 14);
  doc.save();
  doc
    .roundedRect(left, summaryStartY, payBoxWidth, payBoxHeight, 6)
    .fillAndStroke(PDF_BRAND.brandSoft, PDF_BRAND.brandBorder);
  doc.restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PDF_BRAND.brandDark)
    .text('HOW TO PAY', left + 12, summaryStartY + 9, { width: payBoxWidth - 24 });
  let payY = doc.y + 3;
  doc.font('Helvetica').fontSize(8.5).fillColor(PDF_BRAND.ink);
  for (const line of payLines) {
    doc.text(line, left + 12, payY, { width: payBoxWidth - 24 });
    payY = doc.y + 2;
  }

  // Right side: Totals summary rows + Balance Due highlight box
  const totalsWidth = width * 0.42;
  const totalsX = right - totalsWidth;
  let totalsY = summaryStartY;

  const summaryRows: [string, bigint][] = [['Total', i.total]];
  if (i.creditedAmount > 0n) summaryRows.push(['Credited', -i.creditedAmount]);
  if (i.amountPaid > 0n) summaryRows.push(['Paid', -i.amountPaid]);

  for (const [label, value] of summaryRows) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(label, totalsX, totalsY, { width: totalsWidth - 95, align: 'right' });
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(PDF_BRAND.ink)
      .text(`KES ${money(value)}`, totalsX + totalsWidth - 90, totalsY, {
        width: 90,
        align: 'right',
      });
    totalsY += 16;
  }

  // Highlighted Balance Due bar
  totalsY += 4;
  doc.save();
  doc.roundedRect(totalsX, totalsY, totalsWidth, 26, 5).fill(PDF_BRAND.brandDark);
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#FFFFFF')
    .text('Balance due', totalsX + 10, totalsY + 7.5, {
      width: totalsWidth - 110,
      align: 'left',
      lineBreak: false,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor('#FFFFFF')
    .text(`KES ${money(i.balance)}`, totalsX + totalsWidth - 105, totalsY + 7, {
      width: 95,
      align: 'right',
      lineBreak: false,
    });

  let afterSummaryY = Math.max(summaryStartY + payBoxHeight, totalsY + 32) + 12;

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
  }

  footer(doc, `Please quote ${i.tenant.code} when paying.`, i.number);
  doc.end();
  return bytes;
}
