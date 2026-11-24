/**
 * Phase 23 (the part with no partner): a tenant's payment history certificate. Pure figures
 * from their invoices and the payments allocated to them.
 */
export interface CertInvoice {
  dueDate: Date;
  /** Total less credit notes. */
  net: bigint;
  allocations: { amount: bigint; receivedAt: Date }[];
}

export interface CertFigures {
  invoices: number;
  billed: bigint;
  paid: bigint;
  /** Paid in full by the due date. */
  onTime: number;
  /** Paid in full, but after the due date. */
  late: number;
  /** Not paid in full yet. */
  unpaid: number;
}

export function certificateFigures(invoices: CertInvoice[]): CertFigures {
  const f: CertFigures = { invoices: 0, billed: 0n, paid: 0n, onTime: 0, late: 0, unpaid: 0 };
  for (const i of invoices) {
    if (i.net <= 0n) continue;
    f.invoices += 1;
    f.billed += i.net;
    const paid = i.allocations.reduce((s, a) => s + a.amount, 0n);
    const byDue = i.allocations
      .filter((a) => a.receivedAt.getTime() <= i.dueDate.getTime() + 86_399_999)
      .reduce((s, a) => s + a.amount, 0n);
    f.paid += paid < i.net ? paid : i.net;
    if (byDue >= i.net) f.onTime += 1;
    else if (paid >= i.net) f.late += 1;
    else f.unpaid += 1;
  }
  return f;
}

/** "Q7KM-2XRP-9D" style: 10 characters, no look-alikes (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function certificateCode(random: (n: number) => number): string {
  const c = Array.from({ length: 10 }, () => ALPHABET[random(ALPHABET.length)]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
