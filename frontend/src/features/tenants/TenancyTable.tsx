import { Link } from 'react-router-dom';
import { formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { TENANCY_STATUS, personName } from '../portfolio/labels';
import type { Tenancy } from '../portfolio/types';
import { Badge } from '../portfolio/ui';
import { TenancyActions } from './TenancyActions';

/**
 * Tenancies as a table — the tenancies list, a unit's history and a tenant's history.
 * The column naming the page's own subject is dropped (a unit page needs no unit column).
 */
export function TenancyTable({
  rows,
  showTenant = true,
  showUnit = true,
}: {
  rows: Tenancy[];
  showTenant?: boolean;
  showUnit?: boolean;
}) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            {showTenant ? <th>Tenant</th> : null}
            {showUnit ? <th>Unit</th> : null}
            <th className="num">Rent</th>
            <th>Dates</th>
            <th className="num">Deposit held</th>
            <th>Status</th>
            <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              {showTenant ? (
                <td>
                  <Link className="ad__link" to={`/app/tenants/${t.tenant.id}`}><strong>{personName(t.tenant)}</strong></Link>
                  <span className="ad__sub num">{t.tenant.code} · {t.tenant.phone}</span>
                </td>
              ) : null}
              {showUnit ? (
                <td>
                  <Link className="ad__link" to={`/app/units/${t.unit.id}`}><strong>{t.unit.number}</strong></Link>
                  <span className="ad__sub">{t.unit.property.name}</span>
                </td>
              ) : null}
              <td className="num">
                {formatKES(t.rentAmount)}
                <span className="ad__sub">Due day {t.billingDay}</span>
              </td>
              <td>
                {formatDay(t.startDate)} – {t.endDate ? formatDay(t.endDate) : 'now'}
                {t.status === 'NOTICE' && t.endDate ? <span className="ad__sub">Leaving {formatDay(t.endDate)}</span> : null}
                {t.status === 'ENDED' && t.moveOutReason ? <span className="ad__sub">{t.moveOutReason}</span> : null}
              </td>
              <td className="num">{formatKES(t.depositHeld)}</td>
              <td><Badge table={TENANCY_STATUS} value={t.status} /></td>
              <td className="ad__rowactions"><div><TenancyActions tenancy={t} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
