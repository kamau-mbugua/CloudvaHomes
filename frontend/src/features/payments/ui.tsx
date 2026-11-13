import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SortHeader, type TableSort } from '../../components/SortHeader';
import { formatDateTime, formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { personName } from '../portfolio/labels';
import { REVERSAL, REVERSED } from './labels';
import { isReversal, methodText } from './rules';
import type { Payment } from './types';

/** Pieces the payment screens share: the reversal badges, a signed amount, the payments table. */

/** "Reversal" on a reversal, "Reversed" on a payment that has been reversed. */
export function PaymentBadges({ payment }: { payment: Pick<Payment, 'amount' | 'reversesId' | 'reversedBy'> }) {
  if (isReversal(payment)) return <span className={`ad__badge ${REVERSAL.tone}`}>{REVERSAL.label}</span>;
  if (payment.reversedBy) return <span className={`ad__badge ${REVERSED.tone}`}>{REVERSED.label}</span>;
  return null;
}

/**
 * An amount that may be negative. A reversal reads "−KES 5,000.00" in the reversal
 * colour, so it is never mistaken for money received.
 */
export function SignedAmount({ minor, struck = false }: { minor: number; struck?: boolean }) {
  const cls = ['num', minor < 0 ? 'py__neg' : '', struck ? 'py__struck' : ''].filter(Boolean).join(' ');
  return <span className={cls}>{minor < 0 ? `−${formatKES(-minor)}` : formatKES(minor)}</span>;
}

/** Payments as a table — the payments list and the tenant page. */
export function PaymentsTable({
  rows,
  showTenant = true,
  sort,
  actions,
}: {
  rows: Payment[];
  showTenant?: boolean;
  /** Present on the payments list: the Received and Amount headers sort it. */
  sort?: TableSort;
  /** Present on Money → Receipts: buttons for each row (receipt preview, send, download). */
  actions?: (p: Payment) => ReactNode;
}) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table py__table">
        <thead>
          <tr>
            <th>Receipt</th>
            {showTenant ? <th>Tenant</th> : null}
            {sort ? <SortHeader field="receivedAt" label="Received" sort={sort} /> : <th>Received</th>}
            <th>Method</th>
            <th>Reference</th>
            {sort ? <SortHeader field="amount" label="Amount" sort={sort} className="num" /> : <th className="num">Amount</th>}
            <th className="num">Credit left</th>
            {actions ? <th className="num">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const reversal = isReversal(p);
            return (
              <tr key={p.id} className={reversal ? 'py__reversalrow' : p.reversedBy ? 'py__reversedrow' : undefined}>
                <td>
                  <Link className="ad__link" to={`/app/payments/${p.id}`}><strong className="code">{p.number}</strong></Link>{' '}
                  <PaymentBadges payment={p} />
                  <span className="ad__sub">Recorded {formatDateTime(p.createdAt)}</span>
                </td>
                {showTenant ? (
                  <td>
                    {personName(p.tenant)}
                    <span className="ad__sub code">{p.tenant.code} · {p.tenant.phone}</span>
                  </td>
                ) : null}
                <td>{formatDay(p.receivedAt)}</td>
                <td>{methodText(p)}{p.paidBy ? <span className="ad__sub">Paid by {p.paidBy}</span> : null}</td>
                <td className="num">{p.reference ?? <span className="nx-muted">—</span>}</td>
                <td className="num"><SignedAmount minor={p.amount} struck={Boolean(p.reversedBy)} /></td>
                <td className="num">{p.unallocated > 0 ? formatKES(p.unallocated) : <span className="nx-muted">—</span>}</td>
                {actions ? <td className="num">{actions(p)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
