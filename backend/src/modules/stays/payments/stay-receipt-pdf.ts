import {
  a4,
  DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS,
  drawInstructionsAndSignoff,
  footer,
  header,
  money,
  PDF_BRAND,
  type OrgHeader,
} from '../../../common/pdf/pdf.js';

export const STAY_METHOD_LABEL: Record<string, string> = {
  MPESA_PAYBILL: 'M-Pesa paybill',
  MPESA_TILL: 'M-Pesa till',
  BANK_ACCOUNT: 'Bank',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
};

export interface StayReceiptInput {
  org: OrgHeader;
  payment: {
    number: string;
    method: string;
    amount: bigint;
    reference: string | null;
    receivedAt: string;
  };
  guest: { name: string; phone: string };
  booking: {
    code: string;
    listingTitle: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    total: bigint;
    paid: bigint;
    owed: bigint;
  };
  instructions?: { org?: string | null; system?: string | null };
}

/** A short-stay payment receipt (`SRC-…`), emailed to the guest as a PDF. */
export function renderStayReceiptPdf(r: StayReceiptInput): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(r.payment.number, r.org.name);
  const width = right - left;
  const method = STAY_METHOD_LABEL[r.payment.method] ?? r.payment.method;

  let y = header(
    doc,
    r.org,
    'Receipt',
    [
      ['Receipt No.', r.payment.number],
      ['Date', r.payment.receivedAt],
      ['Method', method],
      ...(r.payment.reference ? ([['Reference', r.payment.reference]] as const) : []),
    ],
    { label: 'Payment received', tone: 'success' },
  );

  // Received from | amount
  const boxH = 70;
  const half = width / 2;
  doc.save();
  doc.rect(left, y, width, boxH).lineWidth(0.75).fillAndStroke('#FFFFFF', PDF_BRAND.borderStrong);
  doc.rect(left + half, y, half, boxH).fill(PDF_BRAND.brandDark);
  doc.restore();
  const pad = 12;
  doc.font('Helvetica-Bold').fontSize(7).fillColor(PDF_BRAND.muted);
  doc.text('RECEIVED FROM', left + pad, y + 10, { width: half - pad * 2 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_BRAND.ink);
  doc.text(r.guest.name, left + pad, y + 22, { width: half - pad * 2 });
  doc.font('Helvetica').fontSize(8.5).fillColor(PDF_BRAND.inkSecondary);
  doc.text(`Tel: ${r.guest.phone}`, left + pad, doc.y + 2, { width: half - pad * 2 });
  doc.font('Helvetica-Bold').fontSize(7).fillColor(PDF_BRAND.brandAccent);
  doc.text('AMOUNT RECEIVED', left + half + pad, y + 10, { width: half - pad * 2 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF');
  doc.text(`KES ${money(r.payment.amount)}`, left + half + pad, y + 21, { width: half - pad * 2 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#DCE3ED');
  doc.text(
    `${method}${r.payment.reference ? `, ref ${r.payment.reference}` : ''}`,
    left + half + pad,
    doc.y + 3,
    { width: half - pad * 2 },
  );
  y += boxH + 16;

  // The booking it pays for
  const rows: [string, string][] = [
    ['Booking', r.booking.code],
    ['Place', r.booking.listingTitle],
    [
      'Stay',
      `${r.booking.checkIn} to ${r.booking.checkOut} (${r.booking.nights} ${r.booking.nights === 1 ? 'night' : 'nights'})`,
    ],
    ['Booking total', `KES ${money(r.booking.total)}`],
    ['Paid so far', `KES ${money(r.booking.paid)}`],
    ['Still to pay', r.booking.owed > 0n ? `KES ${money(r.booking.owed)}` : 'Nothing: fully paid'],
  ];
  doc.save();
  doc.rect(left, y, width, 22).fill(PDF_BRAND.tableHeaderBg);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND.tableHeaderFg);
  doc.text('Paid towards', left + 8, y + 7, { width: width - 16, lineBreak: false });
  y += 22;
  rows.forEach(([label, value], i) => {
    const h = 22;
    if (i % 2 === 1) {
      doc.save();
      doc.rect(left, y, width, h).fill(PDF_BRAND.tableZebraBg);
      doc.restore();
    }
    doc.font('Helvetica').fontSize(9).fillColor(PDF_BRAND.inkSecondary);
    doc.text(label, left + 8, y + 6.5, { width: 140, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_BRAND.ink);
    doc.text(value, left + 150, y + 6.5, { width: width - 158, lineBreak: false });
    y += h;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
  });
  y += 18;

  drawInstructionsAndSignoff(doc, y, {
    orgName: r.org.name,
    orgInstructions: r.instructions?.org ?? null,
    systemInstructions: r.instructions?.system ?? DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS,
    signoffLeft: `Guest: ${r.guest.name}`,
    signoffCenter: `Booking: ${r.booking.code}`,
    signoffRight: `Receipt: ${r.payment.number}`,
  });
  footer(doc, `Booking ${r.booking.code}`, r.payment.number);
  doc.end();
  return bytes;
}
