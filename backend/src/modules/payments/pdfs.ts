import { a4, header, money } from '../../common/pdf/pdf.js';
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
  const reversal = p.amount < 0n;
  header(doc, org, reversal ? 'Payment reversal' : 'Receipt', [
    ['Number', p.number],
    ['Date', p.receivedAt],
  ]);
  doc.moveDown(2);
  const width = right - left;
  doc.font('Helvetica-Bold').fontSize(10).text('Received from', left, Math.max(doc.y, 150));
  doc.font('Helvetica').text(`${p.tenant.firstName} ${p.tenant.lastName} (${p.tenant.code})`);
  doc.text(p.tenant.phone);
  if (p.paidBy) doc.text(`Paid by ${p.paidBy}`);
  doc.moveDown();
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(`KES ${money(p.amount)}`, left, undefined, { width });
  doc.font('Helvetica').fontSize(10);
  doc.text(
    `${METHOD[p.method]}${p.channel ? ` — ${p.channel.name}` : ''}${p.reference ? `, ref ${p.reference}` : ''}`,
  );
  if (reversal && p.reversalReason) doc.text(`Reason: ${p.reversalReason}`);
  doc.moveDown();
  if (p.allocations.length) {
    doc.font('Helvetica-Bold').text(reversal ? 'Taken back from' : 'Paid towards');
    doc.font('Helvetica');
    for (const a of p.allocations) {
      doc.text(`${a.invoice.number} (${a.invoice.period})`, left, undefined, {
        continued: true,
        width,
      });
      doc.text(money(a.amount), { align: 'right' });
    }
  }
  if (p.unallocated > 0n) doc.text(`Held as credit: KES ${money(p.unallocated)}`);
  doc.moveDown();
  // The tenant's whole account, not just this payment (which may sit beside other credit).
  doc.font('Helvetica-Bold').text(`Account now: ${balanceText(balance)}`);
  doc
    .fillColor('#666')
    .font('Helvetica')
    .fontSize(8)
    .text(
      p.recordedBy ? `Recorded by ${p.recordedBy.name}` : 'Recorded automatically',
      left,
      doc.page.height - 80,
      { width, align: 'center' },
    );
  doc.end();
  return bytes;
}

export function renderStatementPdf({ statement: s, org }: StatementInput): Promise<Buffer> {
  const { doc, bytes, left, right } = a4(`Statement ${s.tenant.code}`, org.name);
  header(doc, org, 'Statement', [
    ['Tenant', `${s.tenant.firstName} ${s.tenant.lastName} (${s.tenant.code})`],
    ['From', s.from],
    ['To', s.to],
  ]);
  const cols = {
    date: left,
    ref: left + 62,
    desc: left + 160,
    debit: right - 210,
    credit: right - 140,
    bal: right - 70,
  };
  let y = Math.max(doc.y + 30, 170);
  const row = (cells: [string, string, string, string, string, string], bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    doc.text(cells[0], cols.date, y, { width: 60 });
    doc.text(cells[1], cols.ref, y, { width: 95 });
    doc.text(cells[2], cols.desc, y, { width: cols.debit - cols.desc - 5 });
    const end = doc.y;
    doc.text(cells[3], cols.debit, y, { width: 65, align: 'right' });
    doc.text(cells[4], cols.credit, y, { width: 65, align: 'right' });
    doc.text(cells[5], cols.bal, y, { width: 70, align: 'right' });
    y = Math.max(end, y + 11) + 3;
    if (y > doc.page.height - 90) {
      doc.addPage();
      y = 50;
    }
  };
  row(['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'], true);
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
    .font('Helvetica')
    .fontSize(9)
    .text(balanceText(s.closingBalance), left, y + 10);
  if (s.depositHeld > 0n) doc.text(`Deposit held: KES ${money(s.depositHeld)}`);
  doc.end();
  return bytes;
}
