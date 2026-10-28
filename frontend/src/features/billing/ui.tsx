import { Link } from 'react-router-dom';
import { formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod, isPeriod, shiftPeriod } from '../../lib/periods';
import { useCan } from '../../lib/auth/useAuth';
import { portfolioErrorMessage, usePropertyOptions } from '../portfolio/api';
import { personName } from '../portfolio/labels';
import { Badge } from '../portfolio/ui';
import { INVOICE_KIND, INVOICE_STATUS, OVERDUE } from './labels';
import type { Invoice } from './types';

/** Pieces the billing screens share: status badges, a month stepper, a property picker, an invoice table. */

/** The status badge, plus "Overdue" when the balance is past its due date. */
export function InvoiceBadges({ invoice }: { invoice: Pick<Invoice, 'status' | 'overdue'> }) {
  return (
    <span className="bl__badges">
      <Badge table={INVOICE_STATUS} value={invoice.status} />
      {invoice.overdue && invoice.status !== 'VOID' ? <span className={`ad__badge ${OVERDUE.tone}`}>{OVERDUE.label}</span> : null}
    </span>
  );
}

/**
 * ‹ Oct 2026 › — a month stepper rather than `<input type="month">`, which Safari and
 * Firefox on desktop show as a bare text box.
 */
export function MonthPicker({
  value,
  onChange,
  max,
  label = 'Month',
}: {
  value: string;
  onChange: (period: string) => void;
  /** Latest selectable month, e.g. the current one. */
  max?: string;
  label?: string;
}) {
  const valid = isPeriod(value);
  const atMax = Boolean(max && valid && value >= max);
  return (
    <div className="bl__month" role="group" aria-label={label}>
      <button type="button" className="nx-btn nx-btn--sm" aria-label="Previous month" disabled={!valid}
        onClick={() => onChange(shiftPeriod(value, -1))}>‹</button>
      <span className="bl__monthlabel" aria-live="polite">{formatPeriod(value, true)}</span>
      <button type="button" className="nx-btn nx-btn--sm" aria-label="Next month" disabled={!valid || atMax}
        onClick={() => onChange(shiftPeriod(value, 1))}>›</button>
    </div>
  );
}

/** The property picker every per-property billing screen starts with. */
export function PropertySelect({
  value,
  onChange,
  id = 'bl-property',
  allowAll = false,
  className = 'ad__select',
}: {
  value: string;
  onChange: (propertyId: string) => void;
  id?: string;
  allowAll?: boolean;
  className?: string;
}) {
  const canSee = useCan('properties:view');
  const properties = usePropertyOptions(canSee);
  if (!canSee) return null;
  const rows = properties.data?.data ?? [];
  return (
    <select id={id} className={className} aria-label="Property" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{properties.isPending ? 'Loading…' : allowAll ? 'All properties' : 'Choose a property…'}</option>
      {rows.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
      {properties.isError ? <option disabled>{portfolioErrorMessage(properties.error)}</option> : null}
    </select>
  );
}

/** Invoices as a table — the invoices list and the tenant and unit pages. */
export function InvoicesTable({
  rows,
  showTenant = true,
  showUnit = true,
}: {
  rows: Invoice[];
  showTenant?: boolean;
  showUnit?: boolean;
}) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table bl__invoices">
        <thead>
          <tr>
            <th>Invoice</th>
            {showTenant ? <th>Tenant</th> : null}
            {showUnit ? <th>Unit</th> : null}
            <th>Period</th>
            <th>Due</th>
            <th className="num">Total</th>
            <th className="num">Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => (
            <tr key={inv.id} className={inv.status === 'VOID' ? 'bl__void' : undefined}>
              <td>
                <Link className="ad__link" to={`/app/invoices/${inv.id}`}><strong className="num">{inv.number}</strong></Link>
                <span className="ad__sub">{INVOICE_KIND[inv.kind]?.label ?? inv.kind} · {formatDay(inv.issueDate)}</span>
              </td>
              {showTenant ? (
                <td>
                  {personName(inv.tenant)}
                  <span className="ad__sub num">{inv.tenant.code} · {inv.tenant.phone}</span>
                </td>
              ) : null}
              {showUnit ? (
                <td>
                  {inv.unit.number}
                  <span className="ad__sub">{inv.property.name}</span>
                </td>
              ) : null}
              <td>{formatPeriod(inv.period)}</td>
              <td>{formatDay(inv.dueDate)}</td>
              <td className="num">{formatKES(inv.total)}</td>
              <td className={`num ${inv.overdue && inv.status !== 'VOID' ? 'ad__owed' : ''}`}>{formatKES(inv.balance)}</td>
              <td><InvoiceBadges invoice={inv} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
