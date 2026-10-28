/** Pure statement assembly: sorted entries with a running balance. */

export type EntryType = 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT' | 'REVERSAL' | 'DEPOSIT_APPLIED';

export interface RawEntry {
  date: string; // YYYY-MM-DD
  type: EntryType;
  reference: string;
  description: string;
  /** + increases what the tenant owes, − reduces it. */
  amount: bigint;
  at: Date; // tie-break within a day
  invoiceId?: string;
  paymentId?: string;
}

const ORDER: Record<EntryType, number> = {
  INVOICE: 0,
  CREDIT_NOTE: 1,
  PAYMENT: 2,
  DEPOSIT_APPLIED: 3,
  REVERSAL: 4,
};

export function buildStatement(all: RawEntry[], from: string, to: string) {
  const sorted = [...all].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      ORDER[a.type] - ORDER[b.type] ||
      a.at.getTime() - b.at.getTime(),
  );
  const opening = sorted.filter((e) => e.date < from).reduce((s, e) => s + e.amount, 0n);
  let balance = opening;
  const entries = sorted
    .filter((e) => e.date >= from && e.date <= to)
    .map((e) => {
      balance += e.amount;
      return {
        date: e.date,
        type: e.type,
        reference: e.reference,
        description: e.description,
        debit: e.amount > 0n ? e.amount : 0n,
        credit: e.amount < 0n ? -e.amount : 0n,
        balance,
        ...(e.invoiceId ? { invoiceId: e.invoiceId } : {}),
        ...(e.paymentId ? { paymentId: e.paymentId } : {}),
      };
    });
  return { openingBalance: opening, closingBalance: balance, entries };
}
