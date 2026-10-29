import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDateTime, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { unwrap } from '../payments/rules';
import { useListFilters } from '../portfolio/hooks';
import { PAGE_SIZE, keys, platformErrorMessage } from '../platform/api';
import { formatDayish } from '../platform/rules';
import type { OrgStatus } from '../platform/types';
import { OrgStatusBadge } from '../platform/ui';

export type AdminReportKey =
  | 'collections'
  | 'aged-receivables'
  | 'activity'
  | 'subscription-changes'
  | 'onboarding'
  | 'invoices'
  | 'plans'
  | 'reconciliation'
  | 'price-variance'
  | 'salespeople'
  | 'audit';

const REPORT_META: Record<AdminReportKey, { title: string; subtitle: string; usesDateRange: boolean }> = {
  collections: {
    title: 'Collections',
    subtitle: 'Platform subscription payments received by payment method and day.',
    usesDateRange: true,
  },
  'aged-receivables': {
    title: 'Aged receivables',
    subtitle: 'Unpaid and overdue Hodi platform invoices grouped by aging bucket (Current, 1–30, 31–60, 61–90, 90+ days).',
    usesDateRange: false,
  },
  activity: {
    title: 'Organisation activity',
    subtitle: 'Properties, units, let units, active staff, and last sign-in across every organisation.',
    usesDateRange: false,
  },
  'subscription-changes': {
    title: 'Status & plan changes',
    subtitle: 'History of organisation status transitions, plan switches, and price overrides.',
    usesDateRange: true,
  },
  onboarding: {
    title: 'Onboarding funnel',
    subtitle: 'Conversion from organisation signup to owner activation, property setup, let units, and first Hodi payment.',
    usesDateRange: true,
  },
  invoices: {
    title: 'Invoices report',
    subtitle: 'Summary of Hodi platform invoices billed, collected, and outstanding over the period.',
    usesDateRange: true,
  },
  plans: {
    title: 'Plan performance',
    subtitle: 'Active and trial organisations, let units, estimated MRR, and lifetime revenue per plan.',
    usesDateRange: false,
  },
  reconciliation: {
    title: 'Reconciliation',
    subtitle: 'Platform payments matched to Hodi invoices versus unallocated credit.',
    usesDateRange: true,
  },
  'price-variance': {
    title: 'Price vs plan',
    subtitle: 'Organisations on custom per-unit or monthly minimum overrides compared against standard plan pricing.',
    usesDateRange: false,
  },
  salespeople: {
    title: 'Salesperson performance',
    subtitle: 'Book of business, active/trial organisations, let units, billed revenue, collections, and arrears per operator.',
    usesDateRange: true,
  },
  audit: {
    title: 'Platform audit log',
    subtitle: 'Immutable log of platform admin, billing, and security actions.',
    usesDateRange: true,
  },
};

function defaultFromDay(): string {
  const today = todayInNairobi();
  return `${today.slice(0, 4)}-01-01`;
}

function downloadCsvFile(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escapeCsv = (val: string | number | null | undefined) => {
    const s = val === null || val === undefined ? '' : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Admin → Reports (`/admin/reports/:report`): all 11 Superadmin platform reports.
 */
export function AdminReportsPage() {
  const { report: rawKey = 'collections' } = useParams();
  const reportKey: AdminReportKey = (rawKey in REPORT_META ? rawKey : 'collections') as AdminReportKey;
  const meta = REPORT_META[reportKey];
  const filters = useListFilters();
  const today = todayInNairobi();
  const from = filters.get('from') || defaultFromDay();
  const to = filters.get('to') || today;
  const { q, page } = filters;

  const query = useQuery({
    queryKey: [...keys.reports, reportKey, { from, to, q, page }],
    queryFn: () => {
      if (reportKey === 'audit') {
        return api.get<unknown>('/platform/reports/audit', { from, to, q, page, pageSize: PAGE_SIZE });
      }
      const params = meta.usesDateRange ? { from, to } : undefined;
      return api.get<unknown>(`/platform/reports/${encodeURIComponent(reportKey)}`, params).then((b) => unwrap<Record<string, unknown>>(b));
    },
    placeholderData: keepPreviousData,
  });

  return (
    <div className="pg">
      <div className="adm__head">
        <div>
          <h1 className="adm__h1">{meta.title}</h1>
          <p className="ad__muted">{meta.subtitle}</p>
        </div>
      </div>

      {meta.usesDateRange || reportKey === 'audit' ? (
        <div className="ad__filters">
          <label className="ad__muted">
            From{' '}
            <input
              type="date"
              className="ad__select"
              value={from}
              max={to}
              onChange={(e) => filters.setFilter({ from: e.target.value })}
            />
          </label>
          <label className="ad__muted">
            To{' '}
            <input
              type="date"
              className="ad__select"
              value={to}
              max={today}
              onChange={(e) => filters.setFilter({ to: e.target.value })}
            />
          </label>
          {reportKey === 'audit' ? (
            <input
              type="search"
              className="ad__search"
              placeholder="Filter by action (e.g. platform.settings)…"
              aria-label="Filter audit action"
              value={filters.search}
              onChange={(e) => filters.setSearch(e.target.value)}
            />
          ) : null}
        </div>
      ) : null}

      {query.isError ? <p className="ad__error" role="alert">{platformErrorMessage(query.error)}</p> : null}
      {query.isPending ? (
        <p className="ad__muted" role="status">Loading report…</p>
      ) : query.data ? (
        <ReportBody
          reportKey={reportKey}
          data={query.data as Record<string, unknown>}
          onPage={(next) => filters.setFilter({ page: String(next) })}
        />
      ) : null}
    </div>
  );
}

function ReportBody({
  reportKey,
  data,
  onPage,
}: {
  reportKey: AdminReportKey;
  data: Record<string, unknown>;
  onPage: (page: number) => void;
}) {
  switch (reportKey) {
    case 'collections':
      return <CollectionsView data={data} />;
    case 'aged-receivables':
      return <AgedReceivablesView data={data} />;
    case 'activity':
      return <ActivityView data={data} />;
    case 'subscription-changes':
      return <SubscriptionChangesView data={data} />;
    case 'onboarding':
      return <OnboardingView data={data} />;
    case 'invoices':
      return <InvoicesReportView data={data} />;
    case 'plans':
      return <PlansReportView data={data} />;
    case 'reconciliation':
      return <ReconciliationView data={data} />;
    case 'price-variance':
      return <PriceVarianceView data={data} />;
    case 'salespeople':
      return <SalespeopleView data={data} />;
    case 'audit':
      return <AuditReportView data={data} onPage={onPage} />;
  }
}

function CollectionsView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as { count: number; amount: number }) ?? { count: 0, amount: 0 };
  const byMethod = (data.byMethod as { method: string; count: number; amount: number }[]) ?? [];
  const byDay = (data.byDay as { day: string; count: number; amount: number }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Total collected</span>
          <span className="ad__stat__value num">{formatKES(totals.amount)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Payments count</span>
          <span className="ad__stat__value num">{totals.count}</span>
        </div>
        {byMethod.map((m) => (
          <div key={m.method} className="ad__stat">
            <span className="ad__stat__label">{m.method} ({m.count})</span>
            <span className="ad__stat__value num">{formatKES(m.amount)}</span>
          </div>
        ))}
      </div>

      <div className="ad__filters">
        <button
          type="button"
          className="nx-btn nx-btn--sm pg-push"
          disabled={byDay.length === 0}
          onClick={() =>
            downloadCsvFile(
              'hodi-collections.csv',
              ['Day', 'Payments', 'Amount (KES cents)'],
              byDay.map((r) => [r.day, r.count, r.amount]),
            )
          }
        >
          Export CSV
        </button>
      </div>

      {byDay.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No collections in this date range" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Payments</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((row) => (
                <tr key={row.day}>
                  <td>{formatDayish(row.day)}</td>
                  <td className="num">{row.count}</td>
                  <td className="num">{formatKES(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AgedReceivablesView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as { count: number; balance: number }) ?? { count: 0, balance: 0 };
  const buckets = (data.buckets as { key: string; label: string; count: number; balance: number }[]) ?? [];
  const rows = (data.rows as {
    id: string;
    number: string;
    period: string;
    dueDate: string;
    ageDays: number;
    balance: number;
    organization: { id: string; name: string; billingRef: string } | null;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Total unpaid</span>
          <span className={`ad__stat__value num ${totals.balance > 0 ? 'ad__owed' : ''}`}>{formatKES(totals.balance)}</span>
        </div>
        {buckets.map((b) => (
          <div key={b.key} className="ad__stat">
            <span className="ad__stat__label">{b.label} ({b.count})</span>
            <span className="ad__stat__value num">{formatKES(b.balance)}</span>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No unpaid Hodi invoices" detail="Every issued invoice is settled." /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Organisation</th>
                <th>Month</th>
                <th>Due date</th>
                <th className="num">Days overdue</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong className="num">{r.number}</strong></td>
                  <td>
                    {r.organization ? (
                      <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.organization.id)}`}>
                        <strong>{r.organization.name}</strong>
                      </Link>
                    ) : '—'}
                    {r.organization?.billingRef ? <span className="ad__sub num">{r.organization.billingRef}</span> : null}
                  </td>
                  <td>{formatPeriod(r.period)}</td>
                  <td>{formatDayish(r.dueDate)}</td>
                  <td className="num">{r.ageDays}</td>
                  <td className="num ad__owed">{formatKES(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ActivityView({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as {
    id: string;
    name: string;
    billingRef: string;
    kind: string;
    status: OrgStatus;
    planName: string | null;
    propertiesCount: number;
    unitsCount: number;
    occupiedUnitsCount: number;
    activeUsersCount: number;
    lastLoginAt: string | null;
  }[]) ?? [];

  return rows.length === 0 ? (
    <div className="ad__tablewrap"><EmptyState title="No organisations yet" /></div>
  ) : (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Status</th>
            <th>Plan</th>
            <th className="num">Properties</th>
            <th className="num">Units (Let / Total)</th>
            <th className="num">Staff</th>
            <th>Last sign-in</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.id)}`}><strong>{r.name}</strong></Link>
                <span className="ad__sub"><span className="num">{r.billingRef}</span> · {r.kind}</span>
              </td>
              <td><OrgStatusBadge status={r.status} /></td>
              <td>{r.planName ?? '—'}</td>
              <td className="num">{r.propertiesCount}</td>
              <td className="num">{r.occupiedUnitsCount} / {r.unitsCount}</td>
              <td className="num">{r.activeUsersCount}</td>
              <td>{r.lastLoginAt ? formatDateTime(r.lastLoginAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscriptionChangesView({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as {
    id: string;
    action: string;
    orgId: string | null;
    organizationName: string | null;
    billingRef: string | null;
    actorEmail: string | null;
    createdAt: string;
  }[]) ?? [];

  return rows.length === 0 ? (
    <div className="ad__tablewrap"><EmptyState title="No status or plan changes in this period" /></div>
  ) : (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            <th>When</th>
            <th>Organisation</th>
            <th>Action</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{formatDateTime(r.createdAt)}</td>
              <td>
                {r.orgId ? (
                  <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.orgId)}`}>
                    <strong>{r.organizationName ?? r.orgId}</strong>
                  </Link>
                ) : '—'}
                {r.billingRef ? <span className="ad__sub num">{r.billingRef}</span> : null}
              </td>
              <td><span className="num">{r.action}</span></td>
              <td>{r.actorEmail ?? 'System'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OnboardingView({ data }: { data: Record<string, unknown> }) {
  const stages = (data.stages as { stage: string; count: number; conversionRatePct: number }[]) ?? [];

  return (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            <th>Funnel stage</th>
            <th className="num">Organisations</th>
            <th className="num">Conversion rate</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => (
            <tr key={s.stage}>
              <td><strong>{s.stage}</strong></td>
              <td className="num">{s.count}</td>
              <td className="num">{s.conversionRatePct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesReportView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as { count: number; totalBilled: number; totalPaid: number; totalBalance: number }) ?? {
    count: 0, totalBilled: 0, totalPaid: 0, totalBalance: 0,
  };
  const rows = (data.rows as {
    id: string;
    number: string;
    period: string;
    occupiedUnits: number;
    total: number;
    amountPaid: number;
    balance: number;
    status: string;
    issueDate: string;
    dueDate: string;
    organization: { id: string; name: string; billingRef: string } | null;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Invoices issued</span>
          <span className="ad__stat__value num">{totals.count}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Total billed</span>
          <span className="ad__stat__value num">{formatKES(totals.totalBilled)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Total paid</span>
          <span className="ad__stat__value num">{formatKES(totals.totalPaid)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Outstanding balance</span>
          <span className={`ad__stat__value num ${totals.totalBalance > 0 ? 'ad__owed' : ''}`}>{formatKES(totals.totalBalance)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No invoices in this period" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Organisation</th>
                <th>Month</th>
                <th className="num">Let units</th>
                <th className="num">Billed</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong className="num">{r.number}</strong></td>
                  <td>
                    {r.organization ? (
                      <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.organization.id)}`}>
                        <strong>{r.organization.name}</strong>
                      </Link>
                    ) : '—'}
                  </td>
                  <td>{formatPeriod(r.period)}</td>
                  <td className="num">{r.occupiedUnits}</td>
                  <td className="num">{formatKES(r.total)}</td>
                  <td className="num">{formatKES(r.amountPaid)}</td>
                  <td className="num">{formatKES(r.balance)}</td>
                  <td><span className="num">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PlansReportView({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as {
    id: string;
    name: string;
    active: boolean;
    pricePerUnit: number;
    minimumMonthly: number;
    totalOrganizations: number;
    activeOrganizations: number;
    trialOrganizations: number;
    occupiedUnits: number;
    estimatedMonthlyRevenue: number;
    lifetimeCollected: number;
  }[]) ?? [];

  return rows.length === 0 ? (
    <div className="ad__tablewrap"><EmptyState title="No plans configured" /></div>
  ) : (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            <th>Plan</th>
            <th className="num">Rate / Minimum</th>
            <th className="num">Orgs (Active / Trial / Total)</th>
            <th className="num">Let units</th>
            <th className="num">Est. MRR</th>
            <th className="num">Lifetime collected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                {!r.active ? <span className="ad__sub">Inactive</span> : null}
              </td>
              <td className="num">{formatKES(r.pricePerUnit)} · min {formatKES(r.minimumMonthly)}</td>
              <td className="num">{r.activeOrganizations} / {r.trialOrganizations} / {r.totalOrganizations}</td>
              <td className="num">{r.occupiedUnits}</td>
              <td className="num">{formatKES(r.estimatedMonthlyRevenue)}</td>
              <td className="num">{formatKES(r.lifetimeCollected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconciliationView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as { totalPayments: number; allocatedAmount: number; unallocatedCredit: number }) ?? {
    totalPayments: 0, allocatedAmount: 0, unallocatedCredit: 0,
  };
  const rows = (data.rows as {
    id: string;
    amount: number;
    allocated: number;
    unallocated: number;
    method: string;
    source: string;
    reference: string;
    receivedAt: string;
    organization: { id: string; name: string; billingRef: string } | null;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Total received</span>
          <span className="ad__stat__value num">{formatKES(totals.totalPayments)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Allocated to invoices</span>
          <span className="ad__stat__value num">{formatKES(totals.allocatedAmount)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Unallocated credit</span>
          <span className="ad__stat__value num">{formatKES(totals.unallocatedCredit)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No payments in this period" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Organisation</th>
                <th>Reference</th>
                <th>Method</th>
                <th className="num">Amount</th>
                <th className="num">Allocated</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDayish(r.receivedAt)}</td>
                  <td>
                    {r.organization ? (
                      <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.organization.id)}`}>
                        <strong>{r.organization.name}</strong>
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="num">{r.reference}</td>
                  <td>{r.method} · {r.source}</td>
                  <td className="num">{formatKES(r.amount)}</td>
                  <td className="num">{formatKES(r.allocated)}</td>
                  <td className="num">{formatKES(r.unallocated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PriceVarianceView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as { customOrgsCount: number; totalMonthlyDelta: number }) ?? {
    customOrgsCount: 0, totalMonthlyDelta: 0,
  };
  const rows = (data.rows as {
    id: string;
    name: string;
    billingRef: string;
    status: OrgStatus;
    planName: string | null;
    occupiedUnits: number;
    standardMonthly: number;
    effectiveMonthly: number;
    monthlyDelta: number;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Organisations on custom pricing</span>
          <span className="ad__stat__value num">{totals.customOrgsCount}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Net monthly variance vs plan</span>
          <span className={`ad__stat__value num ${totals.totalMonthlyDelta < 0 ? 'ad__owed' : ''}`}>
            {formatKES(totals.totalMonthlyDelta)}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No custom pricing overrides" detail="All organisations use their plan’s standard rate and minimum." /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Status</th>
                <th>Plan</th>
                <th className="num">Let units</th>
                <th className="num">Standard monthly</th>
                <th className="num">Custom monthly</th>
                <th className="num">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.id)}`}><strong>{r.name}</strong></Link>
                    <span className="ad__sub num">{r.billingRef}</span>
                  </td>
                  <td><OrgStatusBadge status={r.status} /></td>
                  <td>{r.planName ?? '—'}</td>
                  <td className="num">{r.occupiedUnits}</td>
                  <td className="num">{formatKES(r.standardMonthly)}</td>
                  <td className="num">{formatKES(r.effectiveMonthly)}</td>
                  <td className={`num ${r.monthlyDelta < 0 ? 'ad__owed' : ''}`}>{formatKES(r.monthlyDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SalespeopleView({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    totalOrganizations: number;
    activeOrganizations: number;
    trialOrganizations: number;
    occupiedUnits: number;
    billedInRange: number;
    collectedInRange: number;
    outstandingBalance: number;
  }[]) ?? [];

  return rows.length === 0 ? (
    <div className="ad__tablewrap"><EmptyState title="No platform operators found" /></div>
  ) : (
    <div className="ad__tablewrap">
      <table className="ad__table">
        <thead>
          <tr>
            <th>Operator</th>
            <th>Role</th>
            <th className="num">Orgs (Active / Trial / Total)</th>
            <th className="num">Let units</th>
            <th className="num">Billed in period</th>
            <th className="num">Collected in period</th>
            <th className="num">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                <span className="ad__sub">{r.email}</span>
              </td>
              <td>
                <span className={`ad__badge ${r.role === 'SUPERADMIN' ? 'ad__badge--info' : 'ad__badge--ok'}`}>
                  {r.role === 'SUPERADMIN' ? 'Superadmin' : 'Salesperson'}
                </span>
              </td>
              <td className="num">{r.activeOrganizations} / {r.trialOrganizations} / {r.totalOrganizations}</td>
              <td className="num">{r.occupiedUnits}</td>
              <td className="num">{formatKES(r.billedInRange)}</td>
              <td className="num">{formatKES(r.collectedInRange)}</td>
              <td className={`num ${r.outstandingBalance > 0 ? 'ad__owed' : ''}`}>{formatKES(r.outstandingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditReportView({ data, onPage }: { data: Record<string, unknown>; onPage: (page: number) => void }) {
  const rows = (data.data as {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    orgId: string | null;
    organizationName: string | null;
    actorEmail: string | null;
    actorName: string | null;
    ip: string | null;
    createdAt: string;
  }[]) ?? [];
  const rawMeta = data.meta as { page: number; pageSize: number; total: number; pages?: number; totalPages?: number } | undefined;
  const meta = rawMeta
    ? { page: rawMeta.page, pageSize: rawMeta.pageSize, total: rawMeta.total, pages: rawMeta.pages ?? rawMeta.totalPages ?? 1 }
    : undefined;

  return (
    <>
      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No audit entries match" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Organisation</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.createdAt)}</td>
                  <td><strong className="num">{r.action}</strong></td>
                  <td>
                    {r.actorName || r.actorEmail || 'System'}
                    {r.ip ? <span className="ad__sub num">{r.ip}</span> : null}
                  </td>
                  <td>{r.organizationName ?? '—'}</td>
                  <td><span className="num">{r.entityType}{r.entityId ? `:${r.entityId.slice(0, 8)}` : ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={meta} onPage={onPage} />
    </>
  );
}
