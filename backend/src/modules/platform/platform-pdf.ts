import {
  a4,
  DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS,
  drawInstructionsAndSignoff,
  footer,
  header,
  money,
  PDF_BRAND,
  type StatusBadgeOptions,
} from '../../common/pdf/pdf.js';

export interface PlatformInvoicePdf {
  invoice: {
    number: string;
    period: string;
    occupiedUnits: number;
    rate: bigint;
    minimum: bigint;
    total: bigint;
    amountPaid: bigint;
    balance: bigint;
    issueDate: string;
    dueDate: string;
    status: string;
  };
  org: { name: string; billingRef: string | null };
  paybill: string | null;
  systemInstructions?: string | null;
}

function platformStatusBadge(status: string): StatusBadgeOptions {
  if (status === 'PAID') return { label: 'Paid in full', tone: 'success' };
  if (status === 'VOID') return { label: 'Voided', tone: 'danger' };
  if (status === 'PARTIALLY_PAID') return { label: 'Partially paid', tone: 'warning' };
  return { label: 'Issued · Payment due', tone: 'neutral' };
}

/** KodiHub's monthly platform subscription invoice to an organisation. */
export function renderPlatformInvoicePdf({
  invoice: i,
  org,
  paybill,
  systemInstructions,
}: PlatformInvoicePdf) {
  const { doc, bytes, left, right } = a4(i.number, 'KodiHub');
  const width = right - left;

  const yAfterHeader = header(
    doc,
    {
      name: 'KodiHub',
      phone: '',
      email: '',
      kraPin: null,
      subtitle: 'Platform Subscription & Billing',
    },
    i.status === 'VOID' ? 'Invoice (void)' : 'Platform Invoice',
    [
      ['Invoice No.', i.number],
      ['Issued', i.issueDate],
      ['Due Date', i.dueDate],
      ['Period', i.period],
    ],
    platformStatusBadge(i.status),
  );

  // Two-column sharp bordered accounting summary grid
  const gridTop = yAfterHeader;
  const gridHeight = 68;
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

  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('BILLED TO', left + padX, gridTop + 10, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PDF_BRAND.ink)
    .text(org.name, left + padX, gridTop + 22, { width: colW });
  if (org.billingRef) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.ink)
      .text(`Account number ${org.billingRef}`, left + padX, doc.y + 4, { width: colW });
  }

  const rightBoxX = left + halfWidth + padX;
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('SUBSCRIPTION METRICS', rightBoxX, gridTop + 10, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PDF_BRAND.ink)
    .text(`${i.occupiedUnits} Let Units (${i.period})`, rightBoxX, gridTop + 22, { width: colW });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      `Rate: KES ${money(i.rate)} / unit  |  Minimum: KES ${money(i.minimum)}`,
      rightBoxX,
      doc.y + 3,
      { width: colW },
    );

  // Table
  let y = gridTop + gridHeight + 16;
  const cols = {
    desc: left + 8,
    units: left + 275,
    rate: left + 340,
    amount: left + 420,
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
  doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND.ink);
  doc.text('Description', cols.desc, headerTextY, { width: 255, lineBreak: false });
  doc.text('Let units', cols.units, headerTextY, { width: 55, align: 'right', lineBreak: false });
  doc.text('Rate (KES)', cols.rate, headerTextY, { width: 70, align: 'right', lineBreak: false });
  doc.text('Amount (KES)', cols.amount, headerTextY, {
    width: right - 8 - cols.amount,
    align: 'right',
    lineBreak: false,
  });

  y += headerBarH;

  const usageTotal = BigInt(i.occupiedUnits) * i.rate;
  const rowTextY = y + 7;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PDF_BRAND.ink)
    .text(
      `KodiHub for ${i.period}: ${i.occupiedUnits} let units x KES ${money(i.rate)}`,
      cols.desc,
      rowTextY,
      { width: 255 },
    );
  doc.fillColor(PDF_BRAND.inkSecondary).text(String(i.occupiedUnits), cols.units, rowTextY, {
    width: 55,
    align: 'right',
    lineBreak: false,
  });
  doc.text(money(i.rate), cols.rate, rowTextY, { width: 70, align: 'right', lineBreak: false });
  doc
    .font('Helvetica-Bold')
    .fillColor(PDF_BRAND.ink)
    .text(money(usageTotal), cols.amount, rowTextY, {
      width: right - 8 - cols.amount,
      align: 'right',
      lineBreak: false,
    });

  y += 24;
  doc.save();
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
  doc.restore();

  if (i.total > usageTotal) {
    doc.save();
    doc.rect(left, y, width, 24).fill(PDF_BRAND.tableZebraBg);
    doc.restore();
    const minRowY = y + 7;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PDF_BRAND.ink)
      .text(`Monthly minimum KES ${money(i.minimum)} applied`, cols.desc, minRowY, { width: 255 });
    doc
      .font('Helvetica-Bold')
      .fillColor(PDF_BRAND.ink)
      .text(money(i.total), cols.amount, minRowY, {
        width: right - 8 - cols.amount,
        align: 'right',
        lineBreak: false,
      });
    y += 24;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
  }

  // Right-aligned totals
  y += 12;
  const totalsWidth = 210;
  const totalsX = right - totalsWidth;
  let totalsY = y;

  for (const [label, val] of [
    ['Total', `KES ${money(i.total)}`],
    ['Paid', `KES ${money(i.amountPaid)}`],
  ] as const) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(label, totalsX, totalsY, { width: 95, align: 'left', lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PDF_BRAND.ink)
      .text(val, totalsX + 100, totalsY, {
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
    .fillAndStroke(PDF_BRAND.surface, PDF_BRAND.ruleHeavy);
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

  const afterSummaryY = totalsY + balBoxH + 16;
  const payLines =
    paybill && org.billingRef && i.balance > 0n
      ? [`Pay by M-Pesa: paybill ${paybill}, account ${org.billingRef}.`]
      : [];

  drawInstructionsAndSignoff(doc, afterSummaryY, {
    orgName: 'KodiHub',
    extraTitle: 'How to pay',
    extraLines: payLines,
    systemInstructions: systemInstructions ?? DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS,
    signoffLeft: 'Issued by KodiHub Billing',
    signoffCenter: org.billingRef ? `Account Ref: ${org.billingRef}` : undefined,
    signoffRight: `Invoice: ${i.number}`,
  });

  footer(doc, org.billingRef ? `Please quote ${org.billingRef} when paying.` : undefined, i.number);
  doc.end();
  return bytes;
}
