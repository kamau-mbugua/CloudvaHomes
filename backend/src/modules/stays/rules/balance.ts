/** The money fields of a booking that decide what the guest still owes (minor units). */
export interface BookingMoney {
  total: bigint;
  amountPaid: bigint;
  amountRefunded: bigint;
  amountWrittenOff?: bigint;
}

/** What the guest still owes: total minus net paid minus any written-off balance, never negative. */
export function owedOn(b: BookingMoney): bigint {
  const owed = b.total - (b.amountPaid - b.amountRefunded) - (b.amountWrittenOff ?? 0n);
  return owed > 0n ? owed : 0n;
}
