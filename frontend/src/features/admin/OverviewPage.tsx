import { Link, useSearchParams } from 'react-router-dom';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { platformErrorMessage, usePlatformStats } from '../platform/api';
import { ORG_STATUS } from '../platform/labels';
import type { OrgStatus } from '../platform/types';

/**
 * Admin → Overview (`/admin`): organisations by status (each opens the filtered list),
 * units let across KodiHub, last month's billing, what is outstanding and what came in this
 * month (`GET /platform/stats`).
 */

const STATUSES: OrgStatus[] = ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CLOSED'];
type OverviewTab = 'money' | 'organizations';

export function OverviewPage() {
  const stats = usePlatformStats();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: OverviewTab = rawTab === 'organizations' ? 'organizations' : 'money';

  const setTab = (next: OverviewTab) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'money') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  if (stats.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (stats.isError) return <div className="pg"><p className="ad__error" role="alert">{platformErrorMessage(stats.error)}</p></div>;
  const s = stats.data;

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Overview sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'money'}
            className="pf__tab"
            onClick={() => setTab('money')}
          >
            Money &amp; billing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'organizations'}
            className="pf__tab"
            onClick={() => setTab('organizations')}
          >
            Organisations
          </button>
        </div>
      </div>

      {tab === 'money' ? (
        <>
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

          <div className="ad__callout">
            <p>Invoices for a month are issued automatically on the 1st at 02:00. You can also run a month by hand; it never bills an organisation twice.</p>
            <Link className="nx-btn nx-btn--sm" to="/admin/invoices">Open invoices</Link>
          </div>
        </>
      ) : (
        <div className="ad__stats">
          {STATUSES.map((status) => (
            <Link key={status} className="ad__stat ad__stat--link" to={`/admin/organizations?status=${status}`}>
              <span className="ad__stat__label">{ORG_STATUS[status].label}</span>
              <span className="ad__stat__value num">{s.organizations?.[status] ?? 0}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
