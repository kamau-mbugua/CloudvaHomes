import { a4, header, money } from '../../common/pdf/pdf.js';

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

/** KodiHub's monthly bill to an organisation. */
export function renderPlatformInvoicePdf({ invoice: i, org, paybill }: PlatformInvoicePdf) {
  const { doc, bytes, left, right } = a4(i.number, 'KodiHub');
  header(
    doc,
    { name: 'KodiHub', phone: '', email: '', kraPin: null },
    i.status === 'VOID' ? 'Invoice (void)' : 'Invoice',
    [
      ['Number', i.number],
      ['Issued', i.issueDate],
      ['Due', i.dueDate],
    ],
  );
  const width = right - left;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Bill to', left, Math.max(doc.y + 20, 150));
  doc.font('Helvetica').text(org.name);
  if (org.billingRef) doc.text(`Account number ${org.billingRef}`);
  doc.moveDown();
  const line = (label: string, value: string, bold = false) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(label, left, undefined, { continued: true, width });
    doc.text(value, { align: 'right' });
  };
  line(
    `KodiHub for ${i.period}: ${i.occupiedUnits} let units x KES ${money(i.rate)}`,
    money(BigInt(i.occupiedUnits) * i.rate),
  );
  if (i.total > BigInt(i.occupiedUnits) * i.rate)
    line(`Monthly minimum KES ${money(i.minimum)}`, money(i.total));
  doc.moveDown(0.5);
  line('Total', `KES ${money(i.total)}`, true);
  line('Paid', `KES ${money(i.amountPaid)}`);
  line('Balance', `KES ${money(i.balance)}`, true);
  doc.moveDown();
  if (paybill && org.billingRef && i.balance > 0n) {
    doc.font('Helvetica').text(`Pay by M-Pesa: paybill ${paybill}, account ${org.billingRef}.`);
  }
  doc.end();
  return bytes;
}
