import { Link } from 'react-router-dom';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { platformErrorMessage, usePlatformStats } from '../platform/api';
import { ORG_STATUS } from '../platform/labels';
import type { OrgStatus } from '../platform/types';

/**
 * Admin → Overview (`/admin`): organisations by status (each opens the filtered list),
 * units let across Hodi, last month's billing, what is outstanding and what came in this
 * month (`GET /platform/stats`).
 */

const STATUSES: OrgStatus[] = ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CLOSED'];

export function OverviewPage() {
  const stats = usePlatformStats();

  if (stats.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (stats.isError) return <div className="pg"><p className="ad__error" role="alert">{platformErrorMessage(stats.error)}</p></div>;
  const s = stats.data;

  return (
    <div className="pg">
      <h2 className="ad__h2">Money</h2>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Billed for {s.lastMonth ? formatPeriod(s.lastMonth, true) : 'last month'}</span>
          <span className="ad__stat__value num">{formatKES(s.lastMonthBilled)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Outstanding</span>
          <span className={`ad__stat__value num ${s.outstanding > 0 ? 'ad__owed' : ''}`}>{formatKES(s.outstanding)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Collected this month</span>
          <span className="ad__stat__value num">{formatKES(s.collectedThisMonth)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Units let now</span>
          <span className="ad__stat__value num">{s.occupiedUnits.toLocaleString('en-KE')}</span>
        </div>
      </div>

      <h2 className="ad__h2">Organisations</h2>
      <div className="ad__stats">
        {STATUSES.map((status) => (
          <Link key={status} className="ad__stat ad__stat--link" to={`/admin/organizations?status=${status}`}>
            <span className="ad__stat__label">{ORG_STATUS[status].label}</span>
            <span className="ad__stat__value num">{s.organizations?.[status] ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className="ad__callout">
        <p>Invoices for a month are issued automatically on the 1st at 02:00. You can also run a month by hand; it never bills an organisation twice.</p>
        <Link className="nx-btn nx-btn--sm" to="/admin/invoices">Open invoices</Link>
      </div>
    </div>
  );
}
