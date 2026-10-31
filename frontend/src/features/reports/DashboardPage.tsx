import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { switchContext } from '../../lib/auth/session';
import { useAuthState, useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { currentPeriod, formatPeriod, isPeriod } from '../../lib/periods';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loading';
import { ORG_NAV, entriesOf, filterNav } from '../../app/navigation';
import { MonthPicker } from '../billing/ui';
import { SignedAmount } from '../payments/ui';
import { useListFilters } from '../portfolio/hooks';
import { personName } from '../portfolio/labels';
import { reportsErrorMessage, useDashboard } from './api';
import { daysBetween, formatRate, periodRange } from './rules';
import { TrendChart } from './TrendChart';
import type { Dashboard } from './types';

/**
 * The dashboard (`/app`): one month at a glance for people who may see reports — what was
 * invoiced and collected, arrears, expenses, net, occupancy and M-Pesa waiting to be
 * matched, a 12-month trend and the tenants most overdue. Everyone else gets a short
 * welcome with the pages they can open.
 */
export function DashboardPage() {
  const canSee = useCan('reports:view');
  return canSee ? <DashboardFigures /> : <Welcome />;
}

function Welcome() {
  const { session } = useAuthState();
  const pages = filterNav(ORG_NAV, session?.permissions ?? [], session?.activeOrganization?.kind)
    .flatMap(entriesOf)
    .filter((entry) => entry.to !== '/app')
    .slice(0, 6);

  return (
    <div className="ph">
      <EmptyState
        title={`Welcome${session?.user.firstName ? `, ${session.user.firstName}` : ''}`}
        detail={`You’re signed in to ${session?.activeOrganization?.name ?? 'your organisation'}. Use the menu, or press ⌘K / Ctrl+K, to go where you need.`}
        action={pages.length > 0 ? (
          <span className="rp__welcomelinks">
            {pages.map((p) => <Link key={p.to} className="nx-btn nx-btn--sm" to={p.to}>{p.label}</Link>)}
          </span>
        ) : undefined}
      />
    </div>
  );
}

function DashboardFigures() {
  const { session } = useAuthState();
  const filters = useListFilters();
  const thisMonth = currentPeriod();
  const wanted = filters.get('period');
  const period = isPeriod(wanted) && wanted <= thisMonth ? wanted : thisMonth;
  const activePropertyId = session?.activePropertyId ?? null;
  const dashboard = useDashboard(period, true, activePropertyId);
  const properties = session?.properties ?? [];

  const handlePropertySwitch = (nextPropertyId: string | null) => {
    void switchContext({ propertyId: nextPropertyId });
  };

  return (
    <div className="pg">
      <div className="ad__filters">
        <MonthPicker value={period} max={thisMonth} onChange={(p) => filters.setFilter({ period: p === thisMonth ? '' : p })} />
        {properties.length > 1 ? (
          <label className="ad__field ad__field--inline">
            <span className="ad__label">Property scope</span>
            <select
              className="nx-input"
              aria-label="Property scope"
              value={activePropertyId ?? ''}
              onChange={(e) => handlePropertySwitch(e.target.value ? e.target.value : null)}
            >
              <option value="">All properties (Consolidated · {properties.length})</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {dashboard.isFetching && !dashboard.isPending ? <span className="ad__muted" role="status">Updating…</span> : null}
      </div>

      {dashboard.isError ? <p className="ad__error" role="alert">{reportsErrorMessage(dashboard.error)}</p> : null}
      {dashboard.isPending ? <CardSkeleton count={4} /> : null}
      {dashboard.data ? (
        <Figures
          data={dashboard.data}
          period={period}
          activePropertyId={activePropertyId}
          onSwitchProperty={handlePropertySwitch}
        />
      ) : null}
    </div>
  );
}

function Tile({ label, value, sub, to }: { label: string; value: ReactNode; sub?: ReactNode; to?: string }) {
  const body = (
    <>
      <span className="ad__stat__label">{label}</span>
      <span className="ad__stat__value num">{value}</span>
      {sub ? <span className="rp__tilesub">{sub}</span> : null}
    </>
  );
  return to
    ? <Link className="ad__stat ad__stat--link rp__tile" to={to}>{body}</Link>
    : <div className="ad__stat rp__tile">{body}</div>;
}

function Figures({
  data,
  period,
  activePropertyId,
  onSwitchProperty,
}: {
  data: Dashboard;
  period: string;
  activePropertyId: string | null;
  onSwitchProperty: (propertyId: string | null) => void;
}) {
  const canExpenses = useCan('expenses:view');
  const canReconcile = useCan('reconciliation:view');
  const canTenants = useCan('tenants:view');
  const month = formatPeriod(period);
  const range = periodRange(period);
  const occ = data.occupancy;
  const today = data.asOf ?? todayInNairobi();
  const expensesLink = canExpenses ? `/app/expenses?from=${range.from}&to=${range.to > today ? today : range.to}` : undefined;
  const byProperty = data.byProperty ?? [];

  return (
    <>
      <div className="ad__stats rp__tiles">
        <Tile label={`Invoiced · ${month}`} value={formatKES(data.invoiced)} sub="Billed to tenants this month" />
        <Tile
          label={`Collected · ${month}`}
          value={formatKES(data.collected)}
          sub={data.collectionRate === null
            ? 'No invoices this month to measure against'
            : <><strong className="num">{formatRate(data.collectionRate)}</strong> of this month’s invoices paid</>}
        />
        <Tile label="Arrears overdue" value={<span className={data.arrears > 0 ? 'ad__owed' : undefined}>{formatKES(data.arrears)}</span>}
          sub="Past due today, all months" to="/app/reports?tab=arrears" />
        <Tile label={`Expenses · ${month}`} value={formatKES(data.expenses)} sub={canExpenses ? 'See the expenses' : 'Leaving out voided'} to={expensesLink} />
        <Tile label={`Net · ${month}`} value={<SignedAmount minor={data.net} />} sub="Collected less expenses" />
        <Tile
          label="Occupancy"
          value={formatRate(occ.rate)}
          sub={`${occ.occupied + occ.notice} of ${occ.units - occ.unavailable} let · ${occ.notice} on notice · ${occ.vacant} vacant`}
          to="/app/reports?tab=occupancy"
        />
        {typeof data.unmatchedMpesa === 'number' ? (
          <Tile
            label="M-Pesa to match"
            value={<span className={data.unmatchedMpesa > 0 ? 'rp__attention' : undefined}>{data.unmatchedMpesa}</span>}
            sub={data.unmatchedMpesa > 0 ? 'Payments waiting for a tenant' : 'Nothing waiting'}
            to={canReconcile ? '/app/reconciliation' : undefined}
          />
        ) : null}
      </div>

      {activePropertyId === null && byProperty.length > 1 ? (
        <section className="rp__panel">
          <div className="rp__panelhead">
            <h2 className="ad__h2">Properties breakdown ({byProperty.length})</h2>
          </div>
          <div className="ad__tablewrap">
            <table className="ad__table rp__table rp__table--compact">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Occupancy</th>
                  <th className="num">Invoiced</th>
                  <th className="num">Collected</th>
                  <th className="num">Expenses</th>
                  <th className="num">Net</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byProperty.map((row) => (
                  <tr key={row.property.id}>
                    <td>
                      <strong>{row.property.name}</strong>
                      <span className="ad__sub num">{row.property.code}</span>
                    </td>
                    <td>
                      {formatRate(row.rate)}
                      <span className="ad__sub">
                        {row.occupied + row.notice} of {row.units} let · {row.vacant} vacant
                      </span>
                    </td>
                    <td className="num">{formatKES(row.invoiced)}</td>
                    <td className="num">{formatKES(row.collected)}</td>
                    <td className="num">{formatKES(row.expenses)}</td>
                    <td className="num"><SignedAmount minor={row.net} /></td>
                    <td className="num">
                      <button
                        type="button"
                        className="nx-btn nx-btn--sm"
                        onClick={() => onSwitchProperty(row.property.id)}
                      >
                        Switch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.trend.length > 0 ? (
        <section className="rp__panel"><TrendChart points={data.trend} /></section>
      ) : null}

      <section className="rp__panel">
        <div className="rp__panelhead">
          <h2 className="ad__h2">Most overdue tenants</h2>
          <Link className="nx-btn nx-btn--sm" to="/app/reports?tab=arrears">Arrears report</Link>
        </div>
        {data.topOverdue.length === 0 ? (
          <p className="ad__muted">No tenant is overdue.</p>
        ) : (
          <div className="ad__tablewrap">
            <table className="ad__table rp__table rp__table--compact">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Oldest unpaid due</th>
                  <th className="num">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.topOverdue.map((row) => {
                  const days = daysBetween(row.oldestDueDate, today);
                  return (
                    <tr key={row.tenant.id}>
                      <td>
                        {canTenants
                          ? <Link className="ad__link" to={`/app/tenants/${row.tenant.id}`}><strong>{personName(row.tenant)}</strong></Link>
                          : <strong>{personName(row.tenant)}</strong>}
                        <span className="ad__sub num">{row.tenant.code}{row.tenant.phone ? ` · ${row.tenant.phone}` : ''}</span>
                      </td>
                      <td>
                        {formatDay(row.oldestDueDate)}
                        {days !== null && days > 0 ? <span className="ad__sub">{days} {days === 1 ? 'day' : 'days'} ago</span> : null}
                      </td>
                      <td className="num ad__owed">{formatKES(row.overdue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
