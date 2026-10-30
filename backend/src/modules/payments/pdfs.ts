import {
  a4,
  DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS,
  drawInstructionsAndSignoff,
  footer,
  header,
  money,
  PDF_BRAND,
} from '../../common/pdf/pdf.js';
import type { AccountsService } from './accounts.service.js';
import type { PaymentsService } from './payments.service.js';
import { balanceText } from './payments.service.js';

type ReceiptInput = Awaited<ReturnType<PaymentsService['forReceipt']>> & {
  instructions?: {
    org?: string | null;
    system?: string | null;
  };
};
type StatementInput = Awaited<ReturnType<AccountsService['forStatementPdf']>>;

const METHOD = {
  MPESA_PAYBILL: 'M-Pesa paybill',
  MPESA_TILL: 'M-Pesa till',
  BANK_ACCOUNT: 'Bank',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  DEPOSIT: 'Deposit applied',
} as const;

export function renderReceiptPdf({
  payment: p,
  org,
  balance,
  instructions,
}: ReceiptInput): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(p.number, org.name);
  const width = right - left;
  const reversal = p.amount < 0n;

  const yAfterHeader = header(
    doc,
    org,
    reversal ? 'Payment reversal' : 'Receipt',
    [
      ['Receipt No.', p.number],
      ['Date', p.receivedAt],
      ['Method', METHOD[p.method]],
      ...(p.reference ? ([['Reference', p.reference]] as const) : []),
    ],
    reversal
      ? { label: 'Reversed', tone: 'danger' }
      : { label: 'Payment received', tone: 'success' },
  );

  // Two-column sharp bordered accounting summary grid
  const gridTop = yAfterHeader;
  const gridHeight = 78;
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

  // Left cell: RECEIVED FROM
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('RECEIVED FROM', left + padX, gridTop + 10, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PDF_BRAND.ink)
    .text(
      `${p.tenant.firstName} ${p.tenant.lastName} (${p.tenant.code})`,
      left + padX,
      gridTop + 22,
      { width: colW },
    );
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(`Tel: ${p.tenant.phone}`, left + padX, doc.y + 2, { width: colW });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      p.paidBy ? `Paid by ${p.paidBy}` : `Tenant Account Ref: ${p.tenant.code}`,
      left + padX,
      doc.y + 2,
      { width: colW },
    );

  // Right cell: PAYMENT SUMMARY
  const rightX = left + halfWidth + padX;
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(reversal ? PDF_BRAND.dangerText : PDF_BRAND.muted)
    .text(reversal ? 'REVERSED AMOUNT' : 'AMOUNT RECEIVED', rightX, gridTop + 10, {
      width: colW,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(reversal ? PDF_BRAND.dangerText : PDF_BRAND.ink)
    .text(`KES ${money(p.amount)}`, rightX, gridTop + 21, { width: colW });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      `${METHOD[p.method]}${p.channel ? ` - ${p.channel.name}` : ''}${p.reference ? `, ref ${p.reference}` : ''}`,
      rightX,
      doc.y + 3,
      { width: colW },
    );

  let y = gridTop + gridHeight + 16;

  if (reversal && p.reversalReason) {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PDF_BRAND.dangerText)
      .text(`Reason: ${p.reversalReason}`, left, y, { width });
    y = doc.y + 12;
  }

  if (p.note) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(`Note: ${p.note}`, left, y, { width });
    y = doc.y + 10;
  }

  // Invoice allocations ledger table
  if (p.allocations.length) {
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

    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND.ink);
    doc.text(reversal ? 'Taken back from' : 'Paid towards', left + 8, y + 7, {
      width: 240,
      lineBreak: false,
    });
    doc.text('Billing period', left + 255, y + 7, {
      width: 100,
      lineBreak: false,
    });
    doc.text('Amount (KES)', right - 120, y + 7, {
      width: 112,
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
        .text(`${a.invoice.number} (${a.invoice.period})`, left + 8, y + 6.5, {
          width: 240,
          lineBreak: false,
        });
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(PDF_BRAND.inkSecondary)
        .text(a.invoice.period, left + 255, y + 6.5, {
          width: 100,
          lineBreak: false,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(PDF_BRAND.ink)
        .text(money(a.amount), right - 120, y + 6.5, {
          width: 112,
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
      .fontSize(9)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(`Held as credit: KES ${money(p.unallocated)}`, left, y, { width });
    y = doc.y + 8;
  }

  // Account standing summary bar (crisp bordered ledger box)
  const standingBoxH = 28;
  doc.save();
  doc
    .rect(left, y, width, standingBoxH)
    .lineWidth(0.75)
    .fillAndStroke(PDF_BRAND.surface, PDF_BRAND.ruleHeavy);
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(PDF_BRAND.ink)
    .text(`Account now: ${balanceText(balance)}`, left + 10, y + 9, { width: width - 20 });

  y += standingBoxH + 18;

  const recordedByText = p.recordedBy
    ? `Recorded by ${p.recordedBy.name}`
    : 'Recorded automatically';

  drawInstructionsAndSignoff(doc, y, {
    orgName: org.name,
    orgInstructions: instructions?.org ?? null,
    systemInstructions: instructions?.system ?? DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS,
    signoffLeft: recordedByText,
    signoffCenter: `Tenant Ref: ${p.tenant.code}`,
    signoffRight: `Receipt: ${p.number}`,
  });

  footer(doc, recordedByText, p.number);
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

  // KPI summary strip (sharp accounting boxes)
  const stripY = yAfterHeader;
  const stripH = 44;
  const boxW = width / 3;

  const kpis: [string, string][] = [
    ['OPENING BALANCE', `KES ${money(s.openingBalance)}`],
    ['CLOSING BALANCE', `KES ${money(s.closingBalance)}`],
    ['DEPOSIT HELD', `KES ${money(s.depositHeld)}`],
  ];

  doc.save();
  doc
    .rect(left, stripY, width, stripH)
    .lineWidth(0.75)
    .fillAndStroke('#FFFFFF', PDF_BRAND.borderStrong);
  for (let i = 1; i < kpis.length; i++) {
    doc
      .moveTo(left + i * boxW, stripY)
      .lineTo(left + i * boxW, stripY + stripH)
      .lineWidth(0.5)
      .strokeColor(PDF_BRAND.border)
      .stroke();
  }
  doc.restore();

  for (let i = 0; i < kpis.length; i++) {
    const bx = left + i * boxW;
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
    doc.rect(left, y, width, 20).fill(PDF_BRAND.tableHeaderBg);
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(PDF_BRAND.ruleHeavy).stroke();
    doc
      .moveTo(left, y + 20)
      .lineTo(right, y + 20)
      .lineWidth(0.75)
      .strokeColor(PDF_BRAND.ruleHeavy)
      .stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND.ink);
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
      doc.rect(left, y, width, rowH).fill(PDF_BRAND.surface);
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
    .fillColor(PDF_BRAND.ink)
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
