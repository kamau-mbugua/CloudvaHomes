import { a4, footer, header, money, PDF_BRAND } from '../../common/pdf/pdf.js';
import type { StatementsService } from './statements.service.js';

type Statement = Awaited<ReturnType<StatementsService['statement']>>;

const KIND = {
  COLLECTION: 'Collected',
  COMMISSION: 'Commission',
  EXPENSE: 'Expense',
  DEPOSIT: 'Deposit',
  REMITTANCE: 'Payout',
  ADJUSTMENT: 'Adjustment',
} as const;

/** Owner statement, A4. Payable entries in the main table; deposits held summarised below. */
export function renderOwnerStatementPdf(s: Statement): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(
    `Statement ${s.landlord.code} ${s.from}-${s.to}`,
    s.organization.name,
  );
  const width = right - left;

  const yAfterHeader = header(
    doc,
    s.organization,
    'Owner statement',
    [
      ['Landlord', `${s.landlord.name} (${s.landlord.code})`],
      ['Period', s.from === s.to ? s.from : `${s.from} to ${s.to}`],
    ],
    { label: 'Landlord Statement', tone: 'neutral' },
  );

  // KPI strip (sharp accounting boxes)
  const stripY = yAfterHeader;
  const stripH = 44;
  const boxW = width / 4;
  const kpis: [string, string][] = [
    ['COLLECTED', `KES ${money(s.totals.collections)}`],
    ['COMMISSION & EXPENSES', `KES ${money(s.totals.commission + s.totals.expenses)}`],
    ['PAID OUT', `KES ${money(s.totals.remittances)}`],
    ['BALANCE OWED TO YOU', `KES ${money(s.closing.payable)}`],
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
      .fontSize(6.5)
      .fillColor(PDF_BRAND.muted)
      .text(kpis[i]![0], bx + 8, stripY + 8, { width: boxW - 16, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(PDF_BRAND.ink)
      .text(kpis[i]![1], bx + 8, stripY + 21, { width: boxW - 16, lineBreak: false });
  }

  const cols = {
    date: left + 6,
    what: left + 66,
    detail: left + 142,
    amt: right - 150,
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
    doc.text('Item', cols.what, ty, { width: 72, lineBreak: false });
    doc.text('Details', cols.detail, ty, { width: cols.amt - cols.detail - 6, lineBreak: false });
    doc.text('Amount', cols.amt, ty, { width: 72, align: 'right', lineBreak: false });
    doc.text('Owed to you', cols.bal, ty, { width: 66, align: 'right', lineBreak: false });
    y += 20;
  };

  drawTableHeader();

  let rowIdx = 0;
  const row = (c: [string, string, string, string, string], bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const detailH = doc.heightOfString(c[2], { width: cols.amt - cols.detail - 6 });
    const rowH = Math.max(detailH + 9, 18);

    if (y + rowH > doc.page.height - 95) {
      footer(doc, undefined, `Statement ${s.landlord.code}`);
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
    doc.text(c[0], cols.date, ty, { width: 58, lineBreak: false });
    doc.text(c[1], cols.what, ty, { width: 72, lineBreak: false });
    doc.text(c[2], cols.detail, ty, { width: cols.amt - cols.detail - 6 });
    doc.text(c[3], cols.amt, ty, { width: 72, align: 'right', lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .text(c[4], cols.bal, ty, { width: 66, align: 'right', lineBreak: false });

    y += rowH;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
    rowIdx += 1;
  };

  row([s.period.start, '', 'Balance brought forward', '', money(s.opening.payable)]);
  for (const e of s.entries.filter((x) => x.bucket === 'PAYABLE')) {
    const detail = [
      e.property ? `${e.property.name}${e.unit ? ` ${e.unit.number}` : ''}` : null,
      e.tenant ? `${e.tenant.firstName} ${e.tenant.lastName}` : null,
      e.expense?.name ?? null,
      e.memo,
    ]
      .filter(Boolean)
      .join(' · ');
    row([e.occurredAt, KIND[e.kind], detail, money(e.amount), money(e.balance)]);
  }
  row([s.period.end, '', 'Balance owed to you', '', money(s.closing.payable)], true);

  y += 14;
  if (y + 115 > doc.page.height - 80) {
    footer(doc, undefined, `Statement ${s.landlord.code}`);
    doc.addPage();
    y = 40;
  }

  doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF_BRAND.ink).text('Summary', left, y);
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(9).fillColor(PDF_BRAND.ink);
  for (const [k, v] of [
    ['Collected', s.totals.collections],
    ['Commission', -s.totals.commission],
    ['Expenses', -s.totals.expenses],
    ['Adjustments', s.totals.adjustments],
    ['Paid out to you', -s.totals.remittances],
  ] as const) {
    doc.font('Helvetica').text(k, left, y, { width: 170, align: 'left', lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .text(money(v), left + 175, y, { align: 'right', width: 120, lineBreak: false });
    y += 14;
  }

  y += 8;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(PDF_BRAND.ink)
    .text(`Tenants' deposits held for you: KES ${money(s.closing.depositHeld)}`, left, y);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      `Units: ${s.occupancy.totals.units} · let ${s.occupancy.totals.occupied + s.occupancy.totals.notice} · vacant ${s.occupancy.totals.vacant} · tenants owe KES ${money(s.arrears.totals.total)}`,
      left,
      doc.y + 2,
    );

  footer(doc, undefined, `Statement ${s.landlord.code}`);
  doc.end();
  return bytes;
}
