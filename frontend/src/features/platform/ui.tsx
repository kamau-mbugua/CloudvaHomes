import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { copyText } from '../../lib/clipboard';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { InvoiceBadges } from '../billing/ui';
import { Badge } from '../portfolio/ui';
import { ORG_STATUS, PLATFORM_METHOD, PLATFORM_SOURCE } from './labels';
import { formatDayish } from './rules';
import type { OrgStatus, PlatformInvoice, PlatformPayment } from './types';

/** Pieces the organisation's billing page and the admin area share. */

export function OrgStatusBadge({ status }: { status: OrgStatus }) {
  return <Badge table={ORG_STATUS} value={status} />;
}

/** "Custom" — a figure that is this organisation's own rather than its plan's. */
export function CustomBadge({ title = 'This organisation’s own figure, not the plan’s' }: { title?: string }) {
  return <span className="ad__badge ad__badge--info hb__custom" title={title}>Custom</span>;
}

/** A number to type into M-Pesa, with a copy button. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.failed('Couldn’t copy. Select the number and copy it by hand.');
    }
  };
  return (
    <div className="tp__copy">
      <span className="tp__copylabel">{label}</span>
      <strong className="tp__copyvalue num">{value}</strong>
      <button type="button" className="nx-btn tp__copybtn" onClick={copy} aria-label={`Copy ${label.toLowerCase()} ${value}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/**
 * Hodi invoices as a table. The organisation's page passes `actions` (PDF, details); the
 * admin area adds the organisation column and its void action.
 */
export function HodiInvoicesTable({ rows, showOrg = false, actions }: {
  rows: PlatformInvoice[];
  showOrg?: boolean;
  actions?: (invoice: PlatformInvoice) => ReactNode;
}) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table hb__table">
        <thead>
          <tr>
            <th>Invoice</th>
            {showOrg ? <th>Organisation</th> : null}
            <th>Month</th>
            <th className="num">Let units</th>
            <th className="num">Total</th>
            <th className="num">Balance</th>
            <th>Due</th>
            <th>Status</th>
            {actions ? <th aria-label="Actions" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => (
            <tr key={inv.id} className={inv.status === 'VOID' ? 'bl__void' : undefined}>
              <td>
                <strong className="num">{inv.number}</strong>
                <span className="ad__sub">Issued {formatDayish(inv.issueDate)}</span>
              </td>
              {showOrg ? (
                <td>
                  {inv.organization ? (
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(inv.organization.id)}`}>
                      <strong>{inv.organization.name}</strong>
                    </Link>
                  ) : '—'}
                  {inv.organization?.billingRef ? <span className="ad__sub num">{inv.organization.billingRef}</span> : null}
                </td>
              ) : null}
              <td>{formatPeriod(inv.period)}</td>
              <td className="num">
                {inv.occupiedUnits}
                <span className="ad__sub">× {formatKES(inv.rate)}</span>
              </td>
              <td className="num">
                {formatKES(inv.total)}
                {inv.minimum > 0 && inv.total === inv.minimum && inv.occupiedUnits * inv.rate < inv.minimum
                  ? <span className="ad__sub">Monthly minimum</span> : null}
              </td>
              <td className={`num ${inv.overdue && inv.status !== 'VOID' ? 'ad__owed' : ''}`}>{formatKES(inv.balance)}</td>
              <td>{formatDayish(inv.dueDate)}</td>
              <td>
                <InvoiceBadges invoice={inv} />
                {inv.status === 'VOID' && inv.voidReason ? <span className="ad__sub">{inv.voidReason}</span> : null}
              </td>
              {actions ? <td className="ad__rowactions"><div>{actions(inv)}</div></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlatformPaymentsTable({ rows, showOrg = false }: { rows: PlatformPayment[]; showOrg?: boolean }) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table ad__table--compact hb__table">
        <thead>
          <tr>
            <th>Received</th>
            {showOrg ? <th>Organisation</th> : null}
            <th>Reference</th>
            <th>How</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{formatDayish(p.receivedAt)}</td>
              {showOrg ? (
                <td>
                  {p.organization ? (
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(p.organization.id)}`}>
                      <strong>{p.organization.name}</strong>
                    </Link>
                  ) : '—'}
                  {p.organization?.billingRef ? <span className="ad__sub num">{p.organization.billingRef}</span> : null}
                </td>
              ) : null}
              <td>
                <span className="num">{p.reference}</span>
                {p.payerName ? <span className="ad__sub">{p.payerName}</span> : null}
              </td>
              <td>
                <Badge table={PLATFORM_METHOD} value={p.method} />
                {p.source ? <span className="ad__sub">{PLATFORM_SOURCE[p.source] ?? p.source}</span> : null}
              </td>
              <td className="num">
                {formatKES(p.amount)}
                {p.unallocated && p.unallocated > 0 ? <span className="ad__sub">{formatKES(p.unallocated)} held as credit</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
