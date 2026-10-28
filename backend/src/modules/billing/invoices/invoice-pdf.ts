import PDFDocument from 'pdfkit';
import { money } from '../../../common/pdf/pdf.js';
import type { InvoicesService } from './invoices.service.js';

type PdfInput = Awaited<ReturnType<InvoicesService['forPdf']>>;

export { money };

const KIND_TITLE = { MONTHLY: 'Invoice', MOVE_IN: 'Move-in invoice', ADHOC: 'Invoice' } as const;

/** A4 invoice. Built-in Helvetica only, so no font files ship with the image. */
export function renderInvoicePdf({ invoice: i, org }: PdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: i.number, Author: org.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;

  // Header: organisation on the left, invoice facts on the right.
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(org.name, left, 50, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  for (const line of [org.phone, org.email, org.kraPin ? `KRA PIN ${org.kraPin}` : null]) {
    if (line) doc.text(line, { width: width / 2 });
  }
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(18);
  doc.text(i.status === 'VOID' ? `${KIND_TITLE[i.kind]} — VOID` : KIND_TITLE[i.kind], left, 50, {
    width,
    align: 'right',
  });
  doc.font('Helvetica').fontSize(10);
  for (const [k, v] of [
    ['Number', i.number],
    ['Issued', i.issueDate],
    ['Due', i.dueDate],
    ['Period', i.period],
  ] as const) {
    doc.text(`${k}: ${v}`, left, undefined, { width, align: 'right' });
  }

  // Bill to.
  doc.moveDown(2);
  const y0 = Math.max(doc.y, 150);
  doc.font('Helvetica-Bold').fontSize(10).text('Bill to', left, y0);
  doc.font('Helvetica');
  doc.text(`${i.tenant.firstName} ${i.tenant.lastName} (${i.tenant.code})`);
  doc.text(i.tenant.phone);
  doc.text(`Unit ${i.unit.number}, ${i.property.name}`);

  // Lines.
  const cols = { desc: left, qty: left + 290, unit: left + 350, amount: left + 425 };
  let y = doc.y + 20;
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Description', cols.desc, y);
  doc.text('Qty', cols.qty, y, { width: 55, align: 'right' });
  doc.text('Unit price', cols.unit, y, { width: 70, align: 'right' });
  doc.text('Amount (KES)', cols.amount, y, { width: right - cols.amount, align: 'right' });
  y += 14;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#999').stroke();
  doc.font('Helvetica').fontSize(9);
  for (const l of i.lines) {
    y += 6;
    const qty = l.quantity.replace(/\.?0+$/, '') || '0';
    doc.text(l.description + (l.refundable ? ' (refundable)' : ''), cols.desc, y, { width: 280 });
    const rowEnd = doc.y;
    doc.text(qty, cols.qty, y, { width: 55, align: 'right' });
    doc.text(money(l.unitAmount), cols.unit, y, { width: 70, align: 'right' });
    doc.text(money(l.amount), cols.amount, y, { width: right - cols.amount, align: 'right' });
    y = Math.max(rowEnd, y + 12);
  }
  y += 6;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#999').stroke();

  // Totals.
  const totals: [string, bigint][] = [['Total', i.total]];
  if (i.creditedAmount > 0n) totals.push(['Credited', -i.creditedAmount]);
  if (i.amountPaid > 0n) totals.push(['Paid', -i.amountPaid]);
  totals.push(['Balance due', i.balance]);
  for (const [label, value] of totals) {
    y += 8;
    doc.font(label === 'Balance due' ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    doc.text(label, cols.unit - 60, y, { width: 130, align: 'right' });
    doc.text(money(value), cols.amount, y, { width: right - cols.amount, align: 'right' });
    y += 6;
  }

  if (i.creditNotes.length) {
    doc.font('Helvetica').fontSize(8).fillColor('#444');
    doc.text(
      `Credit notes: ${i.creditNotes.map((c) => `${c.number} ${money(c.amount)} — ${c.reason}`).join('; ')}`,
      left,
      y + 20,
      { width },
    );
  }
  if (i.status === 'VOID' && i.voidReason) {
    doc
      .fillColor('#a00')
      .fontSize(9)
      .text(`Voided: ${i.voidReason}`, left, doc.y + 10, { width });
  }
  doc
    .fillColor('#666')
    .fontSize(8)
    .text(`Please quote ${i.tenant.code} when paying.`, left, doc.page.height - 80, {
      width,
      align: 'center',
    });
  doc.end();
  return done;
}
