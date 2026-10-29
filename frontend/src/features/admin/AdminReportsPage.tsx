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

/** Defensive KES formatter so undefined/null/non-integer values never crash a report view. */
function kes(value: unknown): string {
  const n = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value ?? '0'), 10);
  return formatKES(Number.isFinite(n) ? n : 0);
}

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
    subtitle: 'Platform subscription payments received over the selected period.',
    usesDateRange: true,
  },
  'aged-receivables': {
    title: 'Aged receivables',
    subtitle: 'Unpaid and overdue KodiHub platform invoices grouped by organisation and aging bucket (Current, 1–30, 31–60, 61–90, 90+ days).',
    usesDateRange: false,
  },
  activity: {
    title: 'Organisation activity',
    subtitle: 'Properties, units, let units, tenants, and latest activity across every organisation.',
    usesDateRange: false,
  },
  'subscription-changes': {
    title: 'Status & plan changes',
    subtitle: 'History of organisation status transitions, plan switches, and price overrides.',
    usesDateRange: true,
  },
  onboarding: {
    title: 'Onboarding funnel',
    subtitle: 'Conversion from organisation signup to owner activation, property setup, let units, rent collection, and first KodiHub payment.',
    usesDateRange: true,
  },
  invoices: {
    title: 'Invoices report',
    subtitle: 'Summary of KodiHub platform invoices billed, collected, and outstanding over the period.',
    usesDateRange: true,
  },
  plans: {
    title: 'Plan performance',
    subtitle: 'Active and trial organisations, let units, estimated MRR, collections, and arrears per plan.',
    usesDateRange: true,
  },
  reconciliation: {
    title: 'Reconciliation',
    subtitle: 'Platform payments with unallocated credit and M-Pesa STK payment push requests.',
    usesDateRange: false,
  },
  'price-variance': {
    title: 'Price vs plan',
    subtitle: 'Organisations on custom per-unit or monthly minimum overrides compared against standard plan pricing.',
    usesDateRange: false,
  },
  salespeople: {
    title: 'Salesperson performance',
    subtitle: 'Book of business, active/trial organisations, let units, MRR, collections, and arrears per operator.',
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
  const totals = (data.totals as { count?: number; amount?: number; byMethod?: Record<string, number> }) ?? {};
  const byMethod = totals.byMethod ?? {};
  const rows = (data.rows as {
    id: string;
    receivedAt: string;
    orgId: string;
    organizationName: string;
    billingRef: string | null;
    salesperson: string | null;
    invoiceNumbers: string | null;
    amount: number;
    unallocated: number;
    method: string;
    source: string;
    reference: string;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Total collected</span>
          <span className="ad__stat__value num">{kes(totals.amount)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Payments count</span>
          <span className="ad__stat__value num">{totals.count ?? rows.length}</span>
        </div>
        {Object.entries(byMethod).map(([method, amount]) => (
          <div key={method} className="ad__stat">
            <span className="ad__stat__label">{method}</span>
            <span className="ad__stat__value num">{kes(amount)}</span>
          </div>
        ))}
      </div>

      <div className="ad__filters">
        <button
          type="button"
          className="nx-btn nx-btn--sm pg-push"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsvFile(
              'hodi-collections.csv',
              ['Received', 'Organisation', 'Billing ref', 'Reference', 'Method', 'Source', 'Amount (KES cents)'],
              rows.map((r) => [r.receivedAt, r.organizationName, r.billingRef, r.reference, r.method, r.source, r.amount]),
            )
          }
        >
          Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No collections in this date range" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Organisation</th>
                <th>Salesperson</th>
                <th>Reference</th>
                <th>Method</th>
                <th>Invoices</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDayish(row.receivedAt)}</td>
                  <td>
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(row.orgId)}`}>
                      <strong>{row.organizationName}</strong>
                    </Link>
                    {row.billingRef ? <span className="ad__sub num">{row.billingRef}</span> : null}
                  </td>
                  <td>{row.salesperson ?? '—'}</td>
                  <td className="num">{row.reference}</td>
                  <td>{row.method} · {row.source}</td>
                  <td className="num">{row.invoiceNumbers ?? 'Credit'}</td>
                  <td className="num">{kes(row.amount)}</td>
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
  const totals = (data.totals as {
    current?: number;
    days1to30?: number;
    days31to60?: number;
    days61to90?: number;
    daysOver90?: number;
    total?: number;
    organizationsCount?: number;
  }) ?? {};
  const rows = (data.rows as {
    orgId: string;
    organizationName: string;
    billingRef: string | null;
    status: OrgStatus;
    salesperson: string | null;
    oldestDueDate: string | null;
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    daysOver90: number;
    total: number;
  }[]) ?? [];

  const totalUnpaid = totals.total ?? 0;

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Total unpaid ({totals.organizationsCount ?? rows.length} orgs)</span>
          <span className={`ad__stat__value num ${totalUnpaid > 0 ? 'ad__owed' : ''}`}>{kes(totalUnpaid)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Current (not yet due)</span>
          <span className="ad__stat__value num">{kes(totals.current)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">1–30 days</span>
          <span className="ad__stat__value num">{kes(totals.days1to30)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">31–60 days</span>
          <span className="ad__stat__value num">{kes(totals.days31to60)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">61–90 days</span>
          <span className="ad__stat__value num">{kes(totals.days61to90)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Over 90 days</span>
          <span className={`ad__stat__value num ${(totals.daysOver90 ?? 0) > 0 ? 'ad__owed' : ''}`}>{kes(totals.daysOver90)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No unpaid KodiHub invoices" detail="Every issued invoice is settled." /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Status</th>
                <th>Salesperson</th>
                <th>Oldest due</th>
                <th className="num">Current</th>
                <th className="num">1–30d</th>
                <th className="num">31–60d</th>
                <th className="num">61–90d</th>
                <th className="num">90+d</th>
                <th className="num">Total owed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orgId}>
                  <td>
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.orgId)}`}>
                      <strong>{r.organizationName}</strong>
                    </Link>
                    {r.billingRef ? <span className="ad__sub num">{r.billingRef}</span> : null}
                  </td>
                  <td><OrgStatusBadge status={r.status} /></td>
                  <td>{r.salesperson ?? '—'}</td>
                  <td>{formatDayish(r.oldestDueDate)}</td>
                  <td className="num">{kes(r.current)}</td>
                  <td className="num">{kes(r.days1to30)}</td>
                  <td className="num">{kes(r.days31to60)}</td>
                  <td className="num">{kes(r.days61to90)}</td>
                  <td className="num">{kes(r.daysOver90)}</td>
                  <td className="num ad__owed">{kes(r.total)}</td>
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
  const totals = (data.totals as {
    organizations?: number;
    activeOrganizations?: number;
    properties?: number;
    units?: number;
    occupiedUnits?: number;
    tenants?: number;
  }) ?? {};
  const rows = (data.rows as {
    id: string;
    name: string;
    billingRef: string;
    kind: string;
    status: OrgStatus;
    planName: string | null;
    salesperson: string | null;
    propertiesCount: number;
    unitsCount: number;
    occupiedUnits?: number;
    occupiedUnitsCount?: number;
    tenantsCount?: number;
    lastRentPaymentAt?: string | null;
    lastPlatformPaymentAt?: string | null;
    lastStaffLoginAt?: string | null;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Organisations (Active/Trial)</span>
          <span className="ad__stat__value num">{totals.activeOrganizations ?? 0} / {totals.organizations ?? rows.length}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Properties</span>
          <span className="ad__stat__value num">{totals.properties ?? 0}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Units (Let / Total)</span>
          <span className="ad__stat__value num">{totals.occupiedUnits ?? 0} / {totals.units ?? 0}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Tenants</span>
          <span className="ad__stat__value num">{totals.tenants ?? 0}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No organisations yet" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Salesperson</th>
                <th className="num">Properties</th>
                <th className="num">Units (Let / Total)</th>
                <th className="num">Tenants</th>
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
                  <td>{r.salesperson ?? '—'}</td>
                  <td className="num">{r.propertiesCount ?? 0}</td>
                  <td className="num">{r.occupiedUnits ?? r.occupiedUnitsCount ?? 0} / {r.unitsCount ?? 0}</td>
                  <td className="num">{r.tenantsCount ?? 0}</td>
                  <td>{r.lastStaffLoginAt ? formatDateTime(r.lastStaffLoginAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SubscriptionChangesView({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as {
    id: string;
    action: string;
    orgId: string | null;
    organizationName: string | null;
    billingRef: string | null;
    actorName?: string | null;
    actorEmail: string | null;
    beforeStatus?: string | null;
    afterStatus?: string | null;
    beforePlan?: string | null;
    afterPlan?: string | null;
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
            <th>Details</th>
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
              <td>
                {r.beforeStatus || r.afterStatus ? <span>Status: {r.beforeStatus ?? '—'} → {r.afterStatus ?? '—'} </span> : null}
                {r.beforePlan || r.afterPlan ? <span>Plan: {r.beforePlan ?? '—'} → {r.afterPlan ?? '—'}</span> : null}
              </td>
              <td>{r.actorName || r.actorEmail || 'System'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OnboardingView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as {
    created?: number;
    ownerAccepted?: number;
    addedProperty?: number;
    addedUnits?: number;
    addedTenants?: number;
    collectedRent?: number;
    paidHodi?: number;
  }) ?? {};
  const rows = (data.rows as {
    id: string;
    name: string;
    billingRef: string | null;
    status: OrgStatus;
    salesperson: string | null;
    ownerAccepted: boolean;
    addedProperty: boolean;
    addedUnits: boolean;
    addedTenants: boolean;
    collectedRent: boolean;
    paidHodi: boolean;
    completedSteps: number;
    totalSteps: number;
    createdAt: string;
  }[]) ?? [];

  const created = totals.created ?? rows.length;
  const stages = [
    { label: 'Organisations created', count: created },
    { label: 'Owner accepted invite', count: totals.ownerAccepted ?? 0 },
    { label: 'Added first property', count: totals.addedProperty ?? 0 },
    { label: 'Added units', count: totals.addedUnits ?? 0 },
    { label: 'Added tenants', count: totals.addedTenants ?? 0 },
    { label: 'Collected rent', count: totals.collectedRent ?? 0 },
    { label: 'Paid KodiHub subscription', count: totals.paidHodi ?? 0 },
  ];

  return (
    <>
      <div className="ad__stats">
        {stages.map((s) => (
          <div key={s.label} className="ad__stat">
            <span className="ad__stat__label">{s.label}</span>
            <span className="ad__stat__value num">
              {s.count}{created > 0 ? ` (${Math.round((s.count / created) * 100)}%)` : ''}
            </span>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No organisations created in this period" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Status</th>
                <th>Salesperson</th>
                <th>Progress</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.id)}`}><strong>{r.name}</strong></Link>
                    {r.billingRef ? <span className="ad__sub num">{r.billingRef}</span> : null}
                  </td>
                  <td><OrgStatusBadge status={r.status} /></td>
                  <td>{r.salesperson ?? '—'}</td>
                  <td className="num">{r.completedSteps} / {r.totalSteps} milestones</td>
                  <td>{formatDayish(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function InvoicesReportView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as {
    count?: number;
    billed?: number;
    paid?: number;
    outstanding?: number;
    overdue?: number;
  }) ?? {};
  const rows = (data.rows as {
    id: string;
    number: string;
    period: string;
    occupiedUnits: number;
    total: number;
    amountPaid: number;
    balance: number;
    status: string;
    orgId?: string;
    organizationName?: string;
    billingRef?: string | null;
    salesperson?: string | null;
  }[]) ?? [];

  const outstanding = totals.outstanding ?? 0;

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Invoices issued</span>
          <span className="ad__stat__value num">{totals.count ?? rows.length}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Total billed</span>
          <span className="ad__stat__value num">{kes(totals.billed)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Total paid</span>
          <span className="ad__stat__value num">{kes(totals.paid)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Outstanding balance</span>
          <span className={`ad__stat__value num ${outstanding > 0 ? 'ad__owed' : ''}`}>{kes(outstanding)}</span>
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
                <th>Salesperson</th>
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
                    {r.orgId ? (
                      <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.orgId)}`}>
                        <strong>{r.organizationName ?? r.orgId}</strong>
                      </Link>
                    ) : (r.organizationName ?? '—')}
                    {r.billingRef ? <span className="ad__sub num">{r.billingRef}</span> : null}
                  </td>
                  <td>{r.salesperson ?? '—'}</td>
                  <td>{formatPeriod(r.period)}</td>
                  <td className="num">{r.occupiedUnits}</td>
                  <td className="num">{kes(r.total)}</td>
                  <td className="num">{kes(r.amountPaid)}</td>
                  <td className="num">{kes(r.balance)}</td>
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
  const totals = (data.totals as {
    organizationsTotal?: number;
    organizationsActive?: number;
    occupiedUnits?: number;
    mrr?: number;
    collected?: number;
    outstanding?: number;
  }) ?? {};
  const rows = (data.rows as {
    planId: string | null;
    planName: string;
    active: boolean;
    pricePerUnit: number;
    minimumMonthly: number;
    organizationsTotal: number;
    organizationsActive: number;
    organizationsTrial: number;
    occupiedUnits: number;
    mrr: number;
    collected: number;
    outstanding: number;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Estimated MRR</span>
          <span className="ad__stat__value num">{kes(totals.mrr)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Collected in period</span>
          <span className="ad__stat__value num">{kes(totals.collected)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Outstanding</span>
          <span className="ad__stat__value num">{kes(totals.outstanding)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
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
                <th className="num">Collected</th>
                <th className="num">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.planId ?? `unassigned-${idx}`}>
                  <td>
                    <strong>{r.planName}</strong>
                    {r.planId && !r.active ? <span className="ad__sub">Inactive</span> : null}
                  </td>
                  <td className="num">{kes(r.pricePerUnit)} · min {kes(r.minimumMonthly)}</td>
                  <td className="num">{r.organizationsActive} / {r.organizationsTrial} / {r.organizationsTotal}</td>
                  <td className="num">{r.occupiedUnits}</td>
                  <td className="num">{kes(r.mrr)}</td>
                  <td className="num">{kes(r.collected)}</td>
                  <td className="num">{kes(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ReconciliationView({ data }: { data: Record<string, unknown> }) {
  const totals = (data.totals as {
    unallocatedCount?: number;
    unallocatedAmount?: number;
    stkPendingCount?: number;
    stkFailedCount?: number;
    stkSuccessCount?: number;
  }) ?? {};
  const unallocatedRows = (data.unallocatedPayments as {
    id: string;
    organizationName: string;
    billingRef: string | null;
    amount: number;
    unallocated: number;
    method: string;
    source: string;
    reference: string;
    receivedAt: string;
  }[]) ?? [];
  const stkRows = (data.stkRequests as {
    id: string;
    orgId: string;
    organizationName: string;
    billingRef: string | null;
    phone: string;
    amount: number;
    state: string;
    mpesaReceipt: string | null;
    resultDesc: string | null;
    createdAt: string;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Unallocated credit ({totals.unallocatedCount ?? unallocatedRows.length})</span>
          <span className="ad__stat__value num">{kes(totals.unallocatedAmount)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">STK push succeeded</span>
          <span className="ad__stat__value num">{totals.stkSuccessCount ?? 0}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">STK push pending</span>
          <span className="ad__stat__value num">{totals.stkPendingCount ?? 0}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">STK push failed</span>
          <span className="ad__stat__value num">{totals.stkFailedCount ?? 0}</span>
        </div>
      </div>

      <h2 className="ad__h2">Payments with unallocated credit</h2>
      {unallocatedRows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No unallocated payment credits" /></div>
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
                <th className="num">Unallocated credit</th>
              </tr>
            </thead>
            <tbody>
              {unallocatedRows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDayish(r.receivedAt)}</td>
                  <td>
                    <strong>{r.organizationName}</strong>
                    {r.billingRef ? <span className="ad__sub num">{r.billingRef}</span> : null}
                  </td>
                  <td className="num">{r.reference}</td>
                  <td>{r.method} · {r.source}</td>
                  <td className="num">{kes(r.amount)}</td>
                  <td className="num">{kes(r.unallocated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="ad__h2" style={{ marginTop: '1.5rem' }}>Recent M-Pesa STK payment requests</h2>
      {stkRows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No M-Pesa STK payment requests yet" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Requested</th>
                <th>Organisation</th>
                <th>Phone</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Receipt / Result</th>
              </tr>
            </thead>
            <tbody>
              {stkRows.map((s) => (
                <tr key={s.id}>
                  <td>{formatDateTime(s.createdAt)}</td>
                  <td>
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(s.orgId)}`}>
                      <strong>{s.organizationName}</strong>
                    </Link>
                  </td>
                  <td className="num">{s.phone}</td>
                  <td className="num">{kes(s.amount)}</td>
                  <td><span className="num">{s.state}</span></td>
                  <td>{s.mpesaReceipt ?? s.resultDesc ?? '—'}</td>
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
  const totals = (data.totals as {
    organizationsCount?: number;
    customizedCount?: number;
    standardMrr?: number;
    effectiveMrr?: number;
    netVarianceMrr?: number;
  }) ?? {};
  const rows = (data.rows as {
    orgId: string;
    organizationName: string;
    billingRef: string | null;
    status: OrgStatus;
    salesperson: string | null;
    planName: string;
    occupiedUnits: number;
    custom: boolean;
    standardMonthly: number;
    effectiveMonthly: number;
    varianceMonthly: number;
  }[]) ?? [];

  const netVariance = totals.netVarianceMrr ?? 0;

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Custom pricing orgs</span>
          <span className="ad__stat__value num">{totals.customizedCount ?? 0} / {totals.organizationsCount ?? rows.length}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Standard plan MRR</span>
          <span className="ad__stat__value num">{kes(totals.standardMrr)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Effective MRR</span>
          <span className="ad__stat__value num">{kes(totals.effectiveMrr)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Net monthly variance</span>
          <span className={`ad__stat__value num ${netVariance < 0 ? 'ad__owed' : ''}`}>{kes(netVariance)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No organisations found" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Salesperson</th>
                <th className="num">Let units</th>
                <th className="num">Standard monthly</th>
                <th className="num">Effective monthly</th>
                <th className="num">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orgId}>
                  <td>
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(r.orgId)}`}>
                      <strong>{r.organizationName}</strong>
                    </Link>
                    {r.billingRef ? <span className="ad__sub num">{r.billingRef}</span> : null}
                  </td>
                  <td><OrgStatusBadge status={r.status} /></td>
                  <td>{r.planName}</td>
                  <td>{r.salesperson ?? '—'}</td>
                  <td className="num">{r.occupiedUnits}</td>
                  <td className="num">{kes(r.standardMonthly)}</td>
                  <td className="num">{kes(r.effectiveMonthly)}</td>
                  <td className={`num ${r.varianceMonthly < 0 ? 'ad__owed' : ''}`}>{kes(r.varianceMonthly)}</td>
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
  const totals = (data.totals as {
    organizationsTotal?: number;
    organizationsActive?: number;
    onboardedInRange?: number;
    occupiedUnits?: number;
    mrr?: number;
    collected?: number;
    overdue?: number;
  }) ?? {};
  const rows = (data.rows as {
    salespersonId: string;
    name: string;
    email: string | null;
    role: string;
    organizationsTotal: number;
    organizationsActive: number;
    onboardedInRange: number;
    occupiedUnits: number;
    mrr: number;
    collected: number;
    overdue: number;
  }[]) ?? [];

  return (
    <>
      <div className="ad__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Total book MRR</span>
          <span className="ad__stat__value num">{kes(totals.mrr)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Collected in period</span>
          <span className="ad__stat__value num">{kes(totals.collected)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Overdue balance</span>
          <span className={`ad__stat__value num ${(totals.overdue ?? 0) > 0 ? 'ad__owed' : ''}`}>{kes(totals.overdue)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Onboarded in period</span>
          <span className="ad__stat__value num">{totals.onboardedInRange ?? 0}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No platform operators found" /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Role</th>
                <th className="num">Orgs (Active / Total)</th>
                <th className="num">New in period</th>
                <th className="num">Let units</th>
                <th className="num">Est. MRR</th>
                <th className="num">Collected</th>
                <th className="num">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.salespersonId}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.email ? <span className="ad__sub">{r.email}</span> : null}
                  </td>
                  <td>
                    <span className={`ad__badge ${r.role === 'SUPERADMIN' ? 'ad__badge--info' : 'ad__badge--ok'}`}>
                      {r.role === 'SUPERADMIN' ? 'Superadmin' : 'Salesperson'}
                    </span>
                  </td>
                  <td className="num">{r.organizationsActive} / {r.organizationsTotal}</td>
                  <td className="num">{r.onboardedInRange}</td>
                  <td className="num">{r.occupiedUnits}</td>
                  <td className="num">{kes(r.mrr)}</td>
                  <td className="num">{kes(r.collected)}</td>
                  <td className={`num ${r.overdue > 0 ? 'ad__owed' : ''}`}>{kes(r.overdue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AuditReportView({ data, onPage }: { data: Record<string, unknown>; onPage: (page: number) => void }) {
  const rows = (data.data as {
    id: string;
    action: string;
    entity?: string;
    entityType?: string;
    entityId: string | null;
    orgId: string | null;
    organization?: { id: string; name: string; billingRef: string | null } | null;
    organizationName?: string | null;
    actor?: { id: string; firstName: string; lastName: string; email: string | null } | null;
    actorEmail?: string | null;
    actorName?: string | null;
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
              {rows.map((r) => {
                const actorDisplay = r.actor
                  ? `${r.actor.firstName} ${r.actor.lastName}`.trim() || r.actor.email
                  : r.actorName || r.actorEmail || 'System';
                const orgDisplay = r.organization?.name ?? r.organizationName ?? '—';
                const entityName = r.entity ?? r.entityType ?? '';
                return (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.createdAt)}</td>
                    <td><strong className="num">{r.action}</strong></td>
                    <td>
                      {actorDisplay}
                      {r.ip ? <span className="ad__sub num">{r.ip}</span> : null}
                    </td>
                    <td>{orgDisplay}</td>
                    <td><span className="num">{entityName}{r.entityId ? `:${r.entityId.slice(0, 8)}` : ''}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={meta} onPage={onPage} />
    </>
  );
}
