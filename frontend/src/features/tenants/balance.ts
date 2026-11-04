import { formatKES } from '../../lib/money';

/**
 * How a tenant's balance reads in the tenants list. The API's `balance` is invoiced less
 * paid, so a negative value is money held as credit.
 */
export function balanceCell(balance: number | null | undefined): { tone: 'owed' | 'credit' | 'none'; text: string } {
  if (!balance) return { tone: 'none', text: '—' };
  return balance > 0
    ? { tone: 'owed', text: formatKES(balance) }
    : { tone: 'credit', text: `${formatKES(-balance)} credit` };
}
