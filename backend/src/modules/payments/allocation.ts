/**
 * Pure allocation arithmetic (BigInt cents). The ledger service applies the results.
 */

export interface OpenInvoice {
  id: string;
  balance: bigint;
}

/** Spends `amount` on invoices in the order given (oldest due first). */
export function oldestFirst(invoices: OpenInvoice[], amount: bigint) {
  const plan: { invoiceId: string; amount: bigint }[] = [];
  let left = amount;
  for (const inv of invoices) {
    if (left <= 0n) break;
    const take = inv.balance < left ? inv.balance : left;
    if (take > 0n) {
      plan.push({ invoiceId: inv.id, amount: take });
      left -= take;
    }
  }
  return { plan, remainder: left };
}

/**
 * How much of a move-in invoice's payment is deposit. Refundable lines are paid first, so the
 * deposit held is min(paid, refundable total); this returns the change for a paid amount
 * moving from `before` to `after` (negative on reversals).
 */
export function depositDelta(refundable: bigint, before: bigint, after: bigint): bigint {
  const min = (a: bigint, b: bigint) => (a < b ? a : b);
  return min(after, refundable) - min(before, refundable);
}
