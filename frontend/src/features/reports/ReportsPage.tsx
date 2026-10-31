import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { currentPeriod, formatPeriod, isPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { categoryText } from '../expenses/labels';
import { MonthPicker, PropertySelect } from '../billing/ui';
import { SignedAmount } from '../payments/ui';
import { usePropertyOptions } from '../portfolio/api';
import { useListFilters } from '../portfolio/hooks';
import { personName } from '../portfolio/labels';
import { downloadReportCsv, reportsErrorMessage, useReport } from './api';
import { checkMonthRange, daysBetween, formatRate, pnlCategories, readReportTab } from './rules';
import type { ReportTab } from './rules';
import type { ArrearsReport, OccupancyReport, PnlReport } from './types';

/**
 * Reports (`/app/reports`): three tabs, each a table with totals and "Download CSV" for
 * the same figures — profit and loss per property over a month range (cash basis:
 * collected less expenses), arrears by age as of today, and occupancy with the vacant
 * units. Filters live in the address.
 */

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'pnl', label: 'Profit & loss' },
  { id: 'arrears', label: 'Arrears' },
  { id: 'occupancy', label: 'Occupancy' },
];

export function ReportsPage() {
  const filters = useListFilters();
  const tab = readReportTab(filters.get('tab'));
  const propertyId = filters.get('propertyId');

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Reports">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="pf__tab"
              onClick={() => filters.setFilter({ tab: t.id === 'pnl' ? '' : t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'pnl' ? <PnlTab propertyId={propertyId} />
        : tab === 'arrears' ? <ArrearsTab propertyId={propertyId} />
          : <OccupancyTab propertyId={propertyId} />}
    </div>
  );
}

/** The property's code for a file name, when one property is chosen. */
function usePropertyCode(propertyId: string): string | undefined {
  const canSee = useCan('properties:view');
  const options = usePropertyOptions(canSee && Boolean(propertyId));
  return propertyId ? options.data?.data.find((p) => p.id === propertyId)?.code : undefined;
}

function DownloadCsv({ onDownload, disabled }: { onDownload: () => Promise<void>; disabled?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onDownload();
    } catch (error) {
      toast.failed(reportsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="nx-btn pg-push" disabled={busy || disabled} onClick={run}>
      {busy ? 'Preparing…' : 'Download CSV'}
    </button>
  );
}

function ReportState({ query, empty, children }: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: unknown };
  empty: boolean;
  children: ReactNode;
}) {
  if (query.isError && !query.data) return <p className="ad__error" role="alert">{reportsErrorMessage(query.error)}</p>;
  if (query.isPending) return <TableSkeleton />;
  return (
    <>
      {query.isError ? <p className="ad__error" role="alert">{reportsErrorMessage(query.error)}</p> : null}
      {empty ? null : children}
    </>
  );
}

// ---------------------------------------------------------------- P&L

function PnlTab({ propertyId }: { propertyId: string }) {
  const filters = useListFilters();
  const thisMonth = currentPeriod();
  const from = isPeriod(filters.get('from')) ? filters.get('from') : `${thisMonth.slice(0, 4)}-01`;
  const to = isPeriod(filters.get('to')) ? filters.get('to') : thisMonth;
  const rangeError = checkMonthRange(from, to, thisMonth);
  const params = { from, to, propertyId: propertyId || undefined };
  const report = useReport('pnl', params, !rangeError);
  const code = usePropertyCode(propertyId);
  const rows = report.data?.rows ?? [];

  return (
    <section>
      <div className="ad__filters">
        <MonthPicker label="First month" value={from} max={to} onChange={(p) => filters.setFilter({ from: p })} />
        <span className="ad__muted">to</span>
        <MonthPicker label="Last month" value={to} max={thisMonth} onChange={(p) => filters.setFilter({ to: p })} />
        <PropertySelect allowAll value={propertyId} onChange={(id) => filters.setFilter({ propertyId: id })} />
        <DownloadCsv disabled={Boolean(rangeError)} onDownload={() => downloadReportCsv('pnl', params, { from, to, extra: code })} />
      </div>
      <p className="ad__muted rp__note">
        Collected is money received in {from === to ? formatPeriod(from, true) : `${formatPeriod(from)} – ${formatPeriod(to)}`}, by
        the property of the invoices it paid; credit not yet allocated isn’t counted. Net is collected less expenses. Voided
        invoices and expenses are left out.
      </p>
      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p> : (
        <ReportState query={report} empty={false}>
          {rows.length === 0 ? (
            <div className="ad__tablewrap">
              <EmptyState title="Nothing in this range" detail="No invoices, payments or expenses for these months. Try a wider range." />
            </div>
          ) : report.data ? <PnlTables report={report.data} /> : null}
        </ReportState>
      )}
    </section>
  );
}

function PnlTables({ report }: { report: PnlReport }) {
  const categories = pnlCategories(report);
  const t = report.totals;
  return (
    <>
      <div className="ad__tablewrap">
        <table className="ad__table rp__table">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col" className="num">Rent</th>
              <th scope="col" className="num">Charges</th>
              <th scope="col" className="num">Move-in</th>
              <th scope="col" className="num">Other</th>
              <th scope="col" className="num">Invoiced</th>
              <th scope="col" className="num">Collected</th>
              <th scope="col" className="num">Expenses</th>
              <th scope="col" className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.property.id}>
                <th scope="row">{r.property.name}<span className="ad__sub num">{r.property.code}</span></th>
                <td className="num">{formatKES(r.invoiced.rent)}</td>
                <td className="num">{formatKES(r.invoiced.charges)}</td>
                <td className="num">{formatKES(r.invoiced.moveIn)}</td>
                <td className="num">{formatKES(r.invoiced.other)}</td>
                <td className="num rp__strong">{formatKES(r.invoiced.total)}</td>
                <td className="num rp__strong">{formatKES(r.collected)}</td>
                <td className="num">{formatKES(r.expenses.total)}</td>
                <td className="num rp__strong"><SignedAmount minor={r.net} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <th className="num">{formatKES(t.invoiced.rent)}</th>
              <th className="num">{formatKES(t.invoiced.charges)}</th>
              <th className="num">{formatKES(t.invoiced.moveIn)}</th>
              <th className="num">{formatKES(t.invoiced.other)}</th>
              <th className="num">{formatKES(t.invoiced.total)}</th>
              <th className="num">{formatKES(t.collected)}</th>
              <th className="num">{formatKES(t.expenses.total)}</th>
              <th className="num"><SignedAmount minor={t.net} /></th>
            </tr>
          </tfoot>
        </table>
      </div>

      {categories.length > 0 ? (
        <>
          <h2 className="ad__h2 rp__subhead">Expenses by category</h2>
          <div className="ad__tablewrap">
            <table className="ad__table rp__table">
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  {categories.map((c) => <th key={c} scope="col" className="num">{categoryText(c)}</th>)}
                  <th scope="col" className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.property.id}>
                    <th scope="row">{r.property.name}</th>
                    {categories.map((c) => <td key={c} className="num">{formatKES(r.expenses[c] ?? 0)}</td>)}
                    <td className="num rp__strong">{formatKES(r.expenses.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  {categories.map((c) => <th key={c} className="num">{formatKES(t.expenses[c] ?? 0)}</th>)}
                  <th className="num">{formatKES(t.expenses.total)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- arrears

const BUCKETS: { key: keyof ArrearsReport['totals']; label: string }[] = [
  { key: 'current', label: 'Not yet due' },
  { key: 'd1_30', label: '1–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90plus', label: 'Over 90 days' },
];

function ArrearsTab({ propertyId }: { propertyId: string }) {
  const filters = useListFilters();
  const params = { propertyId: propertyId || undefined };
  const report = useReport('arrears', params);
  const code = usePropertyCode(propertyId);
  const canTenants = useCan('tenants:view');
  const data = report.data;
  const asOf = data?.asOf ?? todayInNairobi();

  return (
    <section>
      <div className="ad__filters">
        <PropertySelect allowAll value={propertyId} onChange={(id) => filters.setFilter({ propertyId: id })} />
        <DownloadCsv onDownload={() => downloadReportCsv('arrears', params, { asOf, extra: code })} />
      </div>
      <p className="ad__muted rp__note">
        What each tenant owes as of {formatDay(asOf)}, by how long it has been past its due date. Credit is money the tenant has
        paid in advance that isn’t yet allocated.
      </p>
      <ReportState query={report} empty={false}>
        {data && data.rows.length === 0 ? (
          <div className="ad__tablewrap"><EmptyState title="No arrears" detail="Every invoice is paid up." /></div>
        ) : data ? (
          <div className="ad__tablewrap">
            <table className="ad__table rp__table">
              <thead>
                <tr>
                  <th scope="col">Tenant</th>
                  {BUCKETS.map((b) => <th key={b.key} scope="col" className="num">{b.label}</th>)}
                  <th scope="col" className="num">Total</th>
                  <th scope="col" className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.tenant.id}>
                    <th scope="row">
                      {canTenants
                        ? <Link className="ad__link" to={`/app/tenants/${r.tenant.id}`}><strong>{personName(r.tenant)}</strong></Link>
                        : <strong>{personName(r.tenant)}</strong>}
                      <span className="ad__sub"><span className="num">{r.tenant.code}</span>{r.units.length ? ` · ${r.units.join(', ')}` : ''}</span>
                      {r.oldestDueDate && r.total > r.current ? <span className="ad__sub">Oldest unpaid due {formatDay(r.oldestDueDate)}</span> : null}
                    </th>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className={`num ${b.key !== 'current' && r[b.key] > 0 ? 'ad__owed' : ''}`}>
                        {r[b.key] ? formatKES(r[b.key]) : <span className="nx-muted">—</span>}
                      </td>
                    ))}
                    <td className="num rp__strong">{formatKES(r.total)}</td>
                    <td className="num">{r.credit ? formatKES(r.credit) : <span className="nx-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total · {data.rows.length} {data.rows.length === 1 ? 'tenant' : 'tenants'}</th>
                  {BUCKETS.map((b) => <th key={b.key} className="num">{formatKES(data.totals[b.key])}</th>)}
                  <th className="num">{formatKES(data.totals.total)}</th>
                  <th className="num">{formatKES(data.totals.credit)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </ReportState>
    </section>
  );
}

// ---------------------------------------------------------------- occupancy

function OccupancyTab({ propertyId }: { propertyId: string }) {
  const filters = useListFilters();
  const params = { propertyId: propertyId || undefined };
  const report = useReport('occupancy', params);
  const code = usePropertyCode(propertyId);
  const canUnits = useCan('units:view');
  const today = todayInNairobi();
  const data = report.data;
  const vacant = (data?.rows ?? []).flatMap((r) => r.vacantUnits.map((u) => ({ ...u, property: r.property })));

  return (
    <section>
      <div className="ad__filters">
        <PropertySelect allowAll value={propertyId} onChange={(id) => filters.setFilter({ propertyId: id })} />
        <DownloadCsv onDownload={() => downloadReportCsv('occupancy', params, { asOf: today, extra: code })} />
      </div>
      <p className="ad__muted rp__note">
        Today. The rate counts units let (occupied or on notice) out of those available — units marked unavailable are left out.
      </p>
      <ReportState query={report} empty={false}>
        {data && data.rows.length === 0 ? (
          <div className="ad__tablewrap"><EmptyState title="No properties" detail="Add properties and units to see occupancy." /></div>
        ) : data ? (
          <>
            <OccupancyTable report={data} />
            <h2 className="ad__h2 rp__subhead">Vacant units</h2>
            {vacant.length === 0 ? <p className="ad__muted">Every available unit is let.</p> : (
              <div className="ad__tablewrap">
                <table className="ad__table rp__table rp__table--compact">
                  <thead>
                    <tr>
                      <th scope="col">Unit</th>
                      <th scope="col">Property</th>
                      <th scope="col">Vacant since</th>
                      <th scope="col" className="num">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacant.map((u) => {
                      const days = u.vacantSince ? daysBetween(u.vacantSince.slice(0, 10), today) : null;
                      return (
                        <tr key={u.id}>
                          <th scope="row">
                            {canUnits ? <Link className="ad__link" to={`/app/units/${u.id}`}><strong>{u.number}</strong></Link> : <strong>{u.number}</strong>}
                          </th>
                          <td>{u.property.name}</td>
                          <td>{formatDay(u.vacantSince?.slice(0, 10))}</td>
                          <td className="num">{days ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </ReportState>
    </section>
  );
}

function OccupancyTable({ report }: { report: OccupancyReport }) {
  const t = report.totals;
  return (
    <div className="ad__tablewrap">
      <table className="ad__table rp__table">
        <thead>
          <tr>
            <th scope="col">Property</th>
            <th scope="col" className="num">Units</th>
            <th scope="col" className="num">Occupied</th>
            <th scope="col" className="num">On notice</th>
            <th scope="col" className="num">Vacant</th>
            <th scope="col" className="num">Unavailable</th>
            <th scope="col" className="num">Rate</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.property.id}>
              <th scope="row">{r.property.name}<span className="ad__sub num">{r.property.code}</span></th>
              <td className="num">{r.units}</td>
              <td className="num">{r.occupied}</td>
              <td className="num">{r.notice}</td>
              <td className="num">{r.vacant}</td>
              <td className="num">{r.unavailable}</td>
              <td className="num rp__strong">{formatRate(r.rate)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <th className="num">{t.units}</th>
            <th className="num">{t.occupied}</th>
            <th className="num">{t.notice}</th>
            <th className="num">{t.vacant}</th>
            <th className="num">{t.unavailable}</th>
            <th className="num">{formatRate(t.rate)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
