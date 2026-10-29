import {
  a4,
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
}

function platformStatusBadge(status: string): StatusBadgeOptions {
  if (status === 'PAID') return { label: 'Paid in full', tone: 'success' };
  if (status === 'VOID') return { label: 'Voided', tone: 'danger' };
  if (status === 'PARTIALLY_PAID') return { label: 'Partially paid', tone: 'warning' };
  return { label: 'Issued · Payment due', tone: 'neutral' };
}

/** KodiHub's monthly platform subscription invoice to an organisation. */
export function renderPlatformInvoicePdf({ invoice: i, org, paybill }: PlatformInvoicePdf) {
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
      ['Number', i.number],
      ['Issued', i.issueDate],
      ['Due', i.dueDate],
      ['Period', i.period],
    ],
    platformStatusBadge(i.status),
  );

  // Two-column info card: BILL TO (left) & SUBSCRIPTION SUMMARY (right)
  const cardTop = yAfterHeader + 2;
  const cardHeight = 68;
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

  const padX = 12;
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.brandAccent)
    .text('BILL TO', left + padX, cardTop + 10, { width: colWidth - padX * 2 });
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PDF_BRAND.ink)
    .text(org.name, left + padX, cardTop + 23, { width: colWidth - padX * 2 });
  if (org.billingRef) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.brandDark)
      .text(`Account number ${org.billingRef}`, left + padX, doc.y + 4, {
        width: colWidth - padX * 2,
      });
  }

  const rightBoxX = left + colWidth + colGap + padX;
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.brandAccent)
    .text('SUBSCRIPTION METRICS', rightBoxX, cardTop + 10, { width: colWidth - padX * 2 });
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PDF_BRAND.ink)
    .text(`${i.occupiedUnits} Let Units (${i.period})`, rightBoxX, cardTop + 23, {
      width: colWidth - padX * 2,
    });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      `Rate: KES ${money(i.rate)} / unit  |  Minimum: KES ${money(i.minimum)}`,
      rightBoxX,
      doc.y + 3,
      { width: colWidth - padX * 2 },
    );

  // Table
  let y = cardTop + cardHeight + 18;
  const cols = {
    desc: left + 10,
    units: left + 275,
    rate: left + 340,
    amount: left + 420,
  };

  const headerBarH = 22;
  doc.save();
  doc.roundedRect(left, y, width, headerBarH, 4).fill(PDF_BRAND.tableHeaderBg);
  doc.restore();

  const headerTextY = y + 6.5;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
  doc.text('Description', cols.desc, headerTextY, { width: 255, lineBreak: false });
  doc.text('Let units', cols.units, headerTextY, { width: 55, align: 'right', lineBreak: false });
  doc.text('Rate (KES)', cols.rate, headerTextY, { width: 70, align: 'right', lineBreak: false });
  doc.text('Amount (KES)', cols.amount, headerTextY, {
    width: right - 10 - cols.amount,
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
      width: right - 10 - cols.amount,
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
        width: right - 10 - cols.amount,
        align: 'right',
        lineBreak: false,
      });
    y += 24;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
  }

  // Payment instructions & totals summary
  y += 16;
  const summaryStartY = y;

  if (paybill && org.billingRef && i.balance > 0n) {
    const payBoxWidth = width * 0.54;
    doc.save();
    doc
      .roundedRect(left, summaryStartY, payBoxWidth, 54, 6)
      .fillAndStroke(PDF_BRAND.brandSoft, PDF_BRAND.brandBorder);
    doc.restore();

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(PDF_BRAND.brandDark)
      .text('HOW TO PAY', left + 12, summaryStartY + 10, { width: payBoxWidth - 24 });
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.ink)
      .text(`Pay by M-Pesa: paybill ${paybill}, account ${org.billingRef}.`, left + 12, doc.y + 4, {
        width: payBoxWidth - 24,
      });
  }

  const totalsWidth = width * 0.42;
  const totalsX = right - totalsWidth;
  let totalsY = summaryStartY;

  for (const [label, val] of [
    ['Total', `KES ${money(i.total)}`],
    ['Paid', `KES ${money(i.amountPaid)}`],
  ] as const) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(label, totalsX, totalsY, { width: totalsWidth - 95, align: 'right' });
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(PDF_BRAND.ink)
      .text(val, totalsX + totalsWidth - 90, totalsY, { width: 90, align: 'right' });
    totalsY += 16;
  }

  totalsY += 4;
  doc.save();
  doc.roundedRect(totalsX, totalsY, totalsWidth, 26, 5).fill(PDF_BRAND.brandDark);
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#FFFFFF')
    .text('Balance', totalsX + 10, totalsY + 7.5, {
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

  footer(
    doc,
    org.billingRef ? `Quote account reference ${org.billingRef} when paying.` : undefined,
    i.number,
  );
  doc.end();
  return bytes;
}
