import { a4, footer, header, money, PDF_BRAND } from '../../common/pdf/pdf.js';
import type { AccountsService } from './accounts.service.js';
import type { PaymentsService } from './payments.service.js';
import { balanceText } from './payments.service.js';

type ReceiptInput = Awaited<ReturnType<PaymentsService['forReceipt']>>;
type StatementInput = Awaited<ReturnType<AccountsService['forStatementPdf']>>;

const METHOD = {
  MPESA_PAYBILL: 'M-Pesa paybill',
  MPESA_TILL: 'M-Pesa till',
  BANK_ACCOUNT: 'Bank',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  DEPOSIT: 'Deposit applied',
} as const;

export function renderReceiptPdf({ payment: p, org, balance }: ReceiptInput): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(p.number, org.name);
  const width = right - left;
  const reversal = p.amount < 0n;

  const yAfterHeader = header(
    doc,
    org,
    reversal ? 'Payment reversal' : 'Receipt',
    [
      ['Number', p.number],
      ['Date', p.receivedAt],
    ],
    reversal
      ? { label: 'Reversed', tone: 'danger' }
      : { label: 'Payment received', tone: 'success' },
  );

  // Highlight banner for Amount Received + Received From card
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
    .fillAndStroke(
      reversal ? PDF_BRAND.dangerBg : PDF_BRAND.brandSoft,
      reversal ? PDF_BRAND.dangerBorder : PDF_BRAND.brandBorder,
    );
  doc.restore();

  const padX = 12;
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.brandAccent)
    .text('RECEIVED FROM', left + padX, cardTop + 10, { width: colWidth - padX * 2 });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(
      `${p.tenant.firstName} ${p.tenant.lastName} (${p.tenant.code})`,
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
    .text(p.tenant.phone, left + padX, doc.y + 2, { width: colWidth - padX * 2 });
  if (p.paidBy) {
    doc.text(`Paid by ${p.paidBy}`, left + padX, doc.y + 2, { width: colWidth - padX * 2 });
  }

  // Right card: Amount & Method
  const rightBoxX = left + colWidth + colGap + padX;
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(reversal ? PDF_BRAND.dangerText : PDF_BRAND.brandDark)
    .text(reversal ? 'REVERSED AMOUNT' : 'AMOUNT RECEIVED', rightBoxX, cardTop + 10, {
      width: colWidth - padX * 2,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(reversal ? PDF_BRAND.dangerText : PDF_BRAND.brandDark)
    .text(`KES ${money(p.amount)}`, rightBoxX, cardTop + 23, { width: colWidth - padX * 2 });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      `${METHOD[p.method]}${p.channel ? ` - ${p.channel.name}` : ''}${p.reference ? `, ref ${p.reference}` : ''}`,
      rightBoxX,
      doc.y + 3,
      { width: colWidth - padX * 2 },
    );

  let y = cardTop + cardHeight + 16;

  if (reversal && p.reversalReason) {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PDF_BRAND.dangerText)
      .text(`Reason: ${p.reversalReason}`, left, y, { width });
    y = doc.y + 12;
  }

  if (p.allocations.length) {
    const headerBarH = 22;
    doc.save();
    doc.roundedRect(left, y, width, headerBarH, 4).fill(PDF_BRAND.tableHeaderBg);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
    doc.text(reversal ? 'Taken back from' : 'Paid towards', left + 10, y + 6.5, {
      width: width - 130,
      lineBreak: false,
    });
    doc.text('Amount (KES)', right - 120, y + 6.5, {
      width: 110,
      align: 'right',
      lineBreak: false,
    });
    y += headerBarH;

    for (let idx = 0; idx < p.allocations.length; idx++) {
      const a = p.allocations[idx]!;
      const rowH = 22;
      if (idx % 2 === 1) {
        doc.save();
        doc.rect(left, y, width, rowH).fill(PDF_BRAND.tableZebraBg);
        doc.restore();
      }
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(PDF_BRAND.ink)
        .text(`${a.invoice.number} (${a.invoice.period})`, left + 10, y + 6, {
          width: width - 130,
          lineBreak: false,
        });
      doc.font('Helvetica-Bold').text(money(a.amount), right - 120, y + 6, {
        width: 110,
        align: 'right',
        lineBreak: false,
      });
      y += rowH;
      doc.save();
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
      doc.restore();
    }
    y += 12;
  }

  if (p.unallocated > 0n) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(`Held as credit: KES ${money(p.unallocated)}`, left, y, { width });
    y = doc.y + 8;
  }

  // Account standing summary bar
  doc.save();
  doc
    .roundedRect(left, y + 4, width, 30, 6)
    .fillAndStroke(PDF_BRAND.surface, PDF_BRAND.borderStrong);
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PDF_BRAND.brandDark)
    .text(`Account now: ${balanceText(balance)}`, left + 12, y + 14, { width: width - 24 });

  footer(
    doc,
    p.recordedBy ? `Recorded by ${p.recordedBy.name}` : 'Recorded automatically',
    p.number,
  );
  doc.end();
  return bytes;
}

export function renderStatementPdf({ statement: s, org }: StatementInput): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(`Statement ${s.tenant.code}`, org.name);
  const width = right - left;

  const yAfterHeader = header(
    doc,
    org,
    'Statement',
    [
      ['Tenant', `${s.tenant.firstName} ${s.tenant.lastName} (${s.tenant.code})`],
      ['From', s.from],
      ['To', s.to],
    ],
    {
      label: s.closingBalance > 0n ? 'Balance owing' : 'Up to date',
      tone: s.closingBalance > 0n ? 'warning' : 'success',
    },
  );

  // KPI summary strip
  const stripY = yAfterHeader + 2;
  const stripH = 46;
  const boxGap = 10;
  const boxW = (width - boxGap * 2) / 3;

  const kpis: [string, string][] = [
    ['OPENING BALANCE', `KES ${money(s.openingBalance)}`],
    ['CLOSING BALANCE', `KES ${money(s.closingBalance)}`],
    ['DEPOSIT HELD', `KES ${money(s.depositHeld)}`],
  ];

  for (let i = 0; i < kpis.length; i++) {
    const bx = left + i * (boxW + boxGap);
    doc.save();
    doc
      .roundedRect(bx, stripY, boxW, stripH, 5)
      .fillAndStroke(
        i === 1 ? PDF_BRAND.brandSoft : PDF_BRAND.surface,
        i === 1 ? PDF_BRAND.brandBorder : PDF_BRAND.border,
      );
    doc.restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(PDF_BRAND.muted)
      .text(kpis[i]![0], bx + 10, stripY + 9, { width: boxW - 20, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(PDF_BRAND.ink)
      .text(kpis[i]![1], bx + 10, stripY + 22, { width: boxW - 20, lineBreak: false });
  }

  const cols = {
    date: left + 6,
    ref: left + 66,
    desc: left + 162,
    debit: right - 210,
    credit: right - 140,
    bal: right - 72,
  };

  let y = stripY + stripH + 16;

  const drawTableHeader = () => {
    doc.save();
    doc.roundedRect(left, y, width, 20, 4).fill(PDF_BRAND.tableHeaderBg);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    const ty = y + 6;
    doc.text('Date', cols.date, ty, { width: 58, lineBreak: false });
    doc.text('Reference', cols.ref, ty, { width: 92, lineBreak: false });
    doc.text('Description', cols.desc, ty, { width: cols.debit - cols.desc - 6, lineBreak: false });
    doc.text('Debit', cols.debit, ty, { width: 65, align: 'right', lineBreak: false });
    doc.text('Credit', cols.credit, ty, { width: 65, align: 'right', lineBreak: false });
    doc.text('Balance', cols.bal, ty, { width: 66, align: 'right', lineBreak: false });
    y += 20;
  };

  drawTableHeader();

  let rowIdx = 0;
  const row = (cells: [string, string, string, string, string, string], bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const descH = doc.heightOfString(cells[2], { width: cols.debit - cols.desc - 6 });
    const rowH = Math.max(descH + 9, 18);

    if (y + rowH > doc.page.height - 90) {
      footer(doc, undefined, `Statement ${s.tenant.code}`);
      doc.addPage();
      y = 36;
      drawTableHeader();
    }

    if (bold) {
      doc.save();
      doc.rect(left, y, width, rowH).fill(PDF_BRAND.brandSoft);
      doc.restore();
    } else if (rowIdx % 2 === 1) {
      doc.save();
      doc.rect(left, y, width, rowH).fill(PDF_BRAND.tableZebraBg);
      doc.restore();
    }

    const ty = y + 5;
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8)
      .fillColor(PDF_BRAND.ink);
    doc.text(cells[0], cols.date, ty, { width: 58, lineBreak: false });
    doc.text(cells[1], cols.ref, ty, { width: 92, lineBreak: false });
    doc.text(cells[2], cols.desc, ty, { width: cols.debit - cols.desc - 6 });
    doc.text(cells[3], cols.debit, ty, { width: 65, align: 'right', lineBreak: false });
    doc.text(cells[4], cols.credit, ty, { width: 65, align: 'right', lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .text(cells[5], cols.bal, ty, { width: 66, align: 'right', lineBreak: false });

    y += rowH;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
    rowIdx += 1;
  };

  row([s.from, '', 'Opening balance', '', '', money(s.openingBalance)]);
  for (const e of s.entries) {
    row([
      e.date,
      e.reference,
      e.description,
      e.debit ? money(e.debit) : '',
      e.credit ? money(e.credit) : '',
      money(e.balance),
    ]);
  }
  row([s.to, '', 'Closing balance', '', '', money(s.closingBalance)], true);

  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(PDF_BRAND.brandDark)
    .text(balanceText(s.closingBalance), left, y + 12);
  if (s.depositHeld > 0n) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(`Deposit held: KES ${money(s.depositHeld)}`, left, doc.y + 3);
  }

  footer(doc, `Please quote ${s.tenant.code} when paying.`, `Statement ${s.tenant.code}`);
  doc.end();
  return bytes;
}
