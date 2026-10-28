import { a4, header, money } from '../../common/pdf/pdf.js';
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
    `Statement ${s.landlord.code} ${s.from}–${s.to}`,
    s.organization.name,
  );
  header(doc, s.organization, 'Owner statement', [
    ['Landlord', `${s.landlord.name} (${s.landlord.code})`],
    ['Period', s.from === s.to ? s.from : `${s.from} to ${s.to}`],
  ]);
  const cols = {
    date: left,
    what: left + 62,
    detail: left + 140,
    amt: right - 150,
    bal: right - 70,
  };
  let y = Math.max(doc.y + 25, 160);
  const row = (c: [string, string, string, string, string], bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    doc.text(c[0], cols.date, y, { width: 60 });
    doc.text(c[1], cols.what, y, { width: 75 });
    doc.text(c[2], cols.detail, y, { width: cols.amt - cols.detail - 5 });
    const end = doc.y;
    doc.text(c[3], cols.amt, y, { width: 75, align: 'right' });
    doc.text(c[4], cols.bal, y, { width: 70, align: 'right' });
    y = Math.max(end, y + 11) + 3;
    if (y > doc.page.height - 90) {
      doc.addPage();
      y = 50;
    }
  };
  row(['Date', 'Item', 'Details', 'Amount', 'Owed to you'], true);
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

  y += 12;
  doc.font('Helvetica-Bold').fontSize(10).text('Summary', left, y);
  doc.font('Helvetica').fontSize(9);
  for (const [k, v] of [
    ['Collected', s.totals.collections],
    ['Commission', -s.totals.commission],
    ['Expenses', -s.totals.expenses],
    ['Adjustments', s.totals.adjustments],
    ['Paid out to you', -s.totals.remittances],
  ] as const) {
    doc.text(k, left, undefined, { continued: true, width: 300 });
    doc.text(money(v), { align: 'right', width: 300 });
  }
  doc.moveDown();
  doc.text(`Tenants' deposits held for you: KES ${money(s.closing.depositHeld)}`);
  doc.text(
    `Units: ${s.occupancy.totals.units} · let ${s.occupancy.totals.occupied + s.occupancy.totals.notice} · vacant ${s.occupancy.totals.vacant} · tenants owe KES ${money(s.arrears.totals.total)}`,
  );
  doc.end();
  return bytes;
}
