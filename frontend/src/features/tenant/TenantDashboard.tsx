import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useSession } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { formatKES } from '../../lib/money';
import { unwrap, unwrapList } from '../payments/rules';
import type { MaintenanceRequestItem } from '../maintenance/types';
import { MAINTENANCE_STATUSES } from '../maintenance/types';
import { TrendChart } from '../reports/TrendChart';
import { pendingChangeText } from '../tenants/leaseTerms';
import { inspectionTodoKey, keys, useTenantActivity, useTenantMonthly } from './api';
import { heroTotal, payButton, toPayByLandlord, todoItems } from './dashboard';
import { PayChooser } from './PayChooser';
import { PaySheet } from './PaySheet';
import { homeText } from './rules';
import { accountsInScope } from './scope';
import { useTenantContext } from './tenantContext';
import type { ConsolidatedTenancy } from './types';

const PAID_SERIES = [
  { key: 'invoiced', label: 'Billed', color: 'var(--viz-1)' },
  { key: 'collected', label: 'Paid', color: 'var(--viz-2)' },
] as const;

const ACTIVITY_ICON: Record<string, string> = { PAYMENT: '✓', INVOICE: '🧾', RENT_CHANGE: '↗', NOTICE: '🔔' };

/**
 * The tenant dashboard (tenant portal redesign): to pay (per landlord), my homes, billed vs
 * paid, recent activity, maintenance, to do and deposits — for all my homes or the one
 * selected in the switcher.
 */
export function TenantDashboard() {
  const { overview: o, scope, setScope } = useTenantContext();
  const session = useSession();
  const wide = useMediaQuery('(min-width: 1280px)');
  const tenancyId = scope.kind === 'home' ? scope.tenancyId : undefined;
  const monthly = useTenantMonthly(wide ? 12 : 6, tenancyId);
  const activity = useTenantActivity(8, tenancyId);
  const [chooser, setChooser] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const ids = accountsInScope(o, scope);
  const homes = o.tenancies.filter((t) => (t.status === 'ACTIVE' || t.status === 'NOTICE') && (!tenancyId || t.id === tenancyId));
  const requests = useQueries({
    queries: ids.map((id) => ({
      queryKey: [...keys.account(id), 'requests', { page: 1 }],
      queryFn: () => api.get<unknown>(`/tenant/accounts/${encodeURIComponent(id)}/requests`).then((b) => unwrapList<MaintenanceRequestItem>(b)),
    })),
  });
  const inspections = useQueries({
    queries: homes.map((t) => ({
      queryKey: inspectionTodoKey(t.tenantId, t.id),
      queryFn: () => api
        .get<unknown>(`/tenant/accounts/${encodeURIComponent(t.tenantId)}/tenancies/${encodeURIComponent(t.id)}/inspections`)
        .then((b) => unwrap<{ kind: string; tenantAcknowledgedAt: string | null }[]>(b).map((i) => ({ ...i, tenancyId: t.id }))),
    })),
  });

  const rows = toPayByLandlord(o, scope);
  const total = heroTotal(rows);
  const owing = rows.filter((r) => r.owed > 0);
  const next = homes.map((t) => t.nextDueDate).filter((d): d is string => !!d).sort()[0];
  const credits = rows.filter((r) => r.credit > 0);
  const openRequests = requests
    .flatMap((q) => q.data ?? [])
    .filter((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS')
    .filter((r) => !tenancyId || r.unit.id === unitIdOf(homes[0]))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todo = todoItems(o, scope, inspections.flatMap((q) => q.data ?? []), todayInNairobi());
  const button = payButton(rows);

  const payNow = () => {
    if (button?.opens === 'prompt') {
      setPaying(rows[0]!.tenantId);
      return;
    }
    setChooser(true);
  };
  const payingAccount = paying ? o.accounts.find((a) => a.tenant.id === paying) : undefined;

  return (
    <div className="ow__stack td">
      <section className={`tp__due ${total > 0 ? 'tp__due--owed' : ''}`} aria-label="To pay">
        <span className="tp__duelabel">{total > 0 ? 'To pay' : 'Nothing to pay'}</span>
        <strong className="tp__dueamt num">{formatKES(total)}</strong>
        <span className="tp__duenote">
          {homes.length > 1 ? `Across ${homes.length} homes` : homes[0] ? homeText(homes[0]) : 'No current home'}
          {next ? ` · next due ${formatDay(next)}` : ''}
        </span>
        {owing.length > 1 ? (
          <ul className="td__split">
            {owing.map((r) => <li key={r.tenantId}><span>{r.orgName}</span><span className="num">{formatKES(r.owed)}</span></li>)}
          </ul>
        ) : null}
        {credits.map((r) => (
          <span key={r.tenantId} className="tp__duenote">{formatKES(r.credit)} in credit with {r.orgName} — used on your next invoice</span>
        ))}
        {button ? (
          <button type="button" className="nx-btn nx-btn--lg nx-btn--money tp__paybtn" onClick={payNow}>
            {button.label}
          </button>
        ) : null}
      </section>

      {scope.kind === 'all' && homes.length > 0 ? (
        <section aria-label="My homes">
          <h2 className="ad__h2">My homes</h2>
          <div className="td__homes">
            {homes.map((t) => <HomeCard key={t.id} home={t} onPick={() => setScope({ kind: 'home', tenantId: t.tenantId, tenancyId: t.id })} />)}
          </div>
        </section>
      ) : null}

      {scope.kind === 'home' && homes[0] ? <HomeFacts home={homes[0]} /> : null}

      <div className="td__grid">
        <section className="rp__panel td__chart">
          {monthly.data ? (
            <TrendChart
              points={monthly.data.map((m) => ({ period: m.period, invoiced: m.invoiced, collected: m.paid, expenses: 0 }))}
              series={PAID_SERIES}
              title={`Billed vs paid · last ${monthly.data.length} months`}
              description="Billed and paid per month"
              emptyText="Nothing billed or paid in these months yet."
            />
          ) : <p className="ad__muted">Loading…</p>}
        </section>

        <section className="ag__card">
          <div className="tp__cardhead"><h3>Recent activity</h3></div>
          {activity.data && activity.data.length === 0 ? <p className="ad__muted">Nothing yet.</p> : null}
          <ul className="tp__rows">
            {(activity.data ?? []).map((a, k) => (
              <li key={`${a.kind}-${a.at}-${k}`}>
                <Link className="tp__row" to={a.link}>
                  <span className="td__icon" aria-hidden="true">{ACTIVITY_ICON[a.kind]}</span>
                  <span className="tp__rowmain">
                    <strong>{a.title}</strong>
                    <span className="ad__sub">{formatDay(a.at.slice(0, 10))}{ids.length > 1 ? ` · ${a.orgName}` : ''}</span>
                  </span>
                  {a.amount !== null ? <span className="num">{formatKES(a.amount)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="ag__card">
          <div className="tp__cardhead"><h3>Maintenance</h3><Link to="/tenant/requests">All requests</Link></div>
          <p className="td__big">{openRequests.length} open</p>
          <ul className="tp__rows">
            {openRequests.slice(0, 2).map((r) => (
              <li key={r.id} className="tp__row">
                <span className="tp__rowmain"><strong>{r.title}</strong><span className="ad__sub">{MAINTENANCE_STATUSES[r.status] ?? r.status}</span></span>
              </li>
            ))}
          </ul>
        </section>

        {todo.length > 0 ? (
          <section className="ag__card">
            <div className="tp__cardhead"><h3>To do</h3></div>
            <ul className="tp__rows">
              {todo.map((t) => (
                <li key={t.text}><Link className="tp__row" to={t.link}><span className="tp__rowmain"><strong>{t.text}</strong></span></Link></li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="ag__card">
          <div className="tp__cardhead"><h3>Deposit held</h3></div>
          <dl className="tp__facts">
            {o.accounts.filter((a) => ids.includes(a.tenant.id)).map((a) => (
              <div key={a.tenant.id}><dt>{a.organization.name}</dt><dd className="num">{formatKES(a.depositHeld)}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      {chooser ? (
        <PayChooser rows={rows} overview={o} onClose={() => setChooser(false)} onPay={(id) => { setChooser(false); setPaying(id); }} />
      ) : null}
      {payingAccount ? (
        <PaySheet
          tenantId={payingAccount.tenant.id}
          orgName={payingAccount.organization.name}
          owed={Math.max(0, payingAccount.balance)}
          ownPhone={payingAccount.tenant.phone ?? session.user.phone}
          onClose={() => setPaying(null)}
        />
      ) : null}
    </div>
  );
}

function unitIdOf(t: ConsolidatedTenancy | undefined): string | undefined {
  return t && typeof t.unit !== 'string' ? t.unit.id : undefined;
}

function statusText(t: ConsolidatedTenancy): { text: string; tone: '' | 'owed' | 'ok' } {
  if ((t.overdue ?? 0) > 0) return { text: `${formatKES(t.overdue!)} overdue${t.daysLate ? ` · ${t.daysLate} days late` : ''}`, tone: 'owed' };
  if ((t.due ?? 0) > 0) return { text: `${formatKES(t.due!)} due`, tone: '' };
  return { text: 'Paid up', tone: 'ok' };
}

function HomeCard({ home, onPick }: { home: ConsolidatedTenancy; onPick: () => void }) {
  const s = statusText(home);
  const change = home.upcomingRentChanges?.[0];
  return (
    <button type="button" className="td__home" onClick={onPick} aria-label={`Show only ${homeText(home)}`}>
      <span className="ad__sub">{home.orgName}</span>
      <strong>{homeText(home)}</strong>
      <span className={`td__status td__status--${s.tone || 'due'}`}>{s.text}</span>
      <span className="ad__sub">
        Rent {formatKES(home.rentAmount)}
        {home.leaseEndDate ? ` · lease ends ${formatDay(home.leaseEndDate)}` : ''}
        {change ? ` · ${pendingChangeText(change)}` : ''}
      </span>
    </button>
  );
}

function HomeFacts({ home }: { home: ConsolidatedTenancy }) {
  const s = statusText(home);
  return (
    <section className="ag__card">
      <div className="tp__cardhead"><h3>{homeText(home)}</h3><span className="ad__sub">{home.orgName}</span></div>
      <dl className="tp__facts">
        <div><dt>Status</dt><dd className={`td__status td__status--${s.tone || 'due'}`}>{s.text}</dd></div>
        <div><dt>Rent a month</dt><dd className="num">{formatKES(home.rentAmount)}</dd></div>
        {home.leaseEndDate ? <div><dt>Lease ends</dt><dd>{formatDay(home.leaseEndDate)}</dd></div> : null}
        {(home.upcomingRentChanges ?? []).map((c) => <div key={c.effectivePeriod}><dt>Rent change</dt><dd>{pendingChangeText(c)}</dd></div>)}
      </dl>
    </section>
  );
}
