import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton, TableSkeleton } from '../../components/Loading';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { todayInNairobi } from '../../lib/dates';
import { csvFilename, saveBlob } from '../../lib/files';
import { formatKES } from '../../lib/money';
import { PropertySelect } from '../billing/ui';
import { TrendChart, type TrendSeries } from '../reports/TrendChart';
import { staysErrorMessage, staysKeys } from './api';
import { toHostTrendPoints, type HostReportSummary } from './ops';

const HOST_TREND_SERIES: readonly TrendSeries[] = [
  { key: 'invoiced', label: 'Booked value', color: 'var(--viz-1)' },
  { key: 'collected', label: 'Received', color: 'var(--viz-2)' },
  { key: 'expenses', label: 'Expenses', color: 'var(--viz-3)' },
];

function defaultDateRange(): { from: string; to: string } {
  const today = todayInNairobi();
  const ym = today.slice(0, 7);
  return {
    from: `${ym}-01`,
    to: today,
  };
}

export function HostReportsPage() {
  const session = useSession();
  const [propertyId, setPropertyId] = useState(
    session?.activePropertyId ?? '',
  );
  const [range, setRange] = useState(defaultDateRange);
  const [downloading, setDownloading] = useState(false);

  const summaryQuery = useQuery({
    queryKey: [
      ...staysKeys.reports,
      { from: range.from, to: range.to, propertyId: propertyId || undefined },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
      });
      if (propertyId) {
        params.set('propertyId', propertyId);
      }
      const res = await api.get<DataEnvelope<HostReportSummary>>(
        `/host/reports/summary?${params.toString()}`,
      );
      return res.data;
    },
  });

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const blob = await api.blob('/host/reports/summary', {
        from: range.from,
        to: range.to,
        propertyId: propertyId || undefined,
        format: 'csv',
      });
      saveBlob(
        blob,
        csvFilename('host-reports', { from: range.from, to: range.to }),
        'text/csv',
      );
    } finally {
      setDownloading(false);
    }
  };

  const summary = summaryQuery.data;

  return (
    <div className="pg">
      <div className="ad__filters">
        <PropertySelect
          allowAll
          value={propertyId}
          onChange={(v) => setPropertyId(v)}
        />
        <label className="py__daterange">
          <span>From</span>
          <input
            type="date"
            className="ad__select"
            value={range.from}
            max={range.to}
            onChange={(e) =>
              setRange((prev) => ({ ...prev, from: e.target.value }))
            }
          />
        </label>
        <label className="py__daterange">
          <span>To</span>
          <input
            type="date"
            className="ad__select"
            value={range.to}
            min={range.from}
            onChange={(e) =>
              setRange((prev) => ({ ...prev, to: e.target.value }))
            }
          />
        </label>

        <div className="bl__headbtns pg-push">
          <button
            type="button"
            className="nx-btn"
            disabled={downloading}
            onClick={() => void handleDownloadCsv()}
          >
            {downloading ? 'Downloading…' : 'Download CSV'}
          </button>
        </div>
      </div>

      {summaryQuery.isError && (
        <p className="ad__error" role="alert">
          {staysErrorMessage(summaryQuery.error)}
        </p>
      )}

      {summaryQuery.isLoading ? (
        <>
          <CardSkeleton count={4} />
          <TableSkeleton rows={5} />
        </>
      ) : summary ? (
        <>
          <div className="ad__stats">
            <div className="ad__stat">
              <span className="ad__stat__label">Received (cash)</span>
              <span className="ad__stat__value num">
                {formatKES(Number(summary.totals.received))}
              </span>
              <span className="ad__sub">
                Refunded: {formatKES(Number(summary.totals.refunded))}
                {BigInt(summary.totals.writtenOff ?? '0') > 0n &&
                  ` · Written off: ${formatKES(Number(summary.totals.writtenOff))}`}
              </span>
            </div>

            <div className="ad__stat">
              <span className="ad__stat__label">Booked value</span>
              <span className="ad__stat__value num">
                {formatKES(Number(summary.totals.bookedValue))}
              </span>
              <span className="ad__sub">
                {summary.totals.nights} nights · ADR{' '}
                {formatKES(Number(summary.totals.adr))}
              </span>
            </div>

            <div className="ad__stat">
              <span className="ad__stat__label">Total expenses</span>
              <span className="ad__stat__value num">
                {formatKES(Number(summary.totals.expenses))}
              </span>
              <span className="ad__sub">
                Shared: {formatKES(Number(summary.totals.sharedExpenses))}
              </span>
            </div>

            <div className="ad__stat">
              <span className="ad__stat__label">Net profit</span>
              <span className="ad__stat__value num">
                {formatKES(Number(summary.totals.profit))}
              </span>
              <span className="ad__sub">
                Occupancy {(summary.totals.occupancy * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {summary.monthly.length > 0 && (
            <TrendChart
              points={toHostTrendPoints(summary.monthly)}
              series={HOST_TREND_SERIES}
              title="Monthly performance"
              description="Booked value, cash received, and expenses by month"
              emptyText="No figures recorded in this range yet."
            />
          )}

          <div className="ad__tablewrap">
            <table className="ad__table rp__table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th className="num">Nights</th>
                  <th className="num">Occupancy</th>
                  <th className="num">ADR</th>
                  <th className="num">Booked</th>
                  <th className="num">Received</th>
                  <th className="num">Refunded</th>
                  <th className="num">Expenses</th>
                  <th className="num">Profit</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.unitId}>
                    <td>
                      <strong>{r.title}</strong>
                      <span className="ad__sub">
                        {r.property.name} · {r.unitNumber}
                      </span>
                    </td>
                    <td className="num">{r.nights}</td>
                    <td className="num">
                      {(r.occupancy * 100).toFixed(1)}%
                    </td>
                    <td className="num">{formatKES(Number(r.adr))}</td>
                    <td className="num">{formatKES(Number(r.bookedValue))}</td>
                    <td className="num">{formatKES(Number(r.received))}</td>
                    <td className="num">{formatKES(Number(r.refunded))}</td>
                    <td className="num">{formatKES(Number(r.expenses))}</td>
                    <td className="num">
                      <strong>{formatKES(Number(r.profit))}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr data-testid="host-reports-totals-row">
                  <td>Total</td>
                  <td className="num">{summary.totals.nights}</td>
                  <td className="num">
                    {(summary.totals.occupancy * 100).toFixed(1)}%
                  </td>
                  <td className="num">
                    {formatKES(Number(summary.totals.adr))}
                  </td>
                  <td className="num">
                    {formatKES(Number(summary.totals.bookedValue))}
                  </td>
                  <td className="num">
                    {formatKES(Number(summary.totals.received))}
                  </td>
                  <td className="num">
                    {formatKES(Number(summary.totals.refunded))}
                  </td>
                  <td className="num">
                    {formatKES(Number(summary.totals.expenses))}
                  </td>
                  <td className="num">
                    {formatKES(Number(summary.totals.profit))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {summary.sharedByProperty.length > 0 && (
            <section className="fm__section">
              <h2>Shared property costs</h2>
              <p className="ad__sub">
                Property-level expenses without a specific unit are split evenly
                across its units.
              </p>
              <div className="ad__tablewrap">
                <table className="ad__table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Code</th>
                      <th className="num">Shared expenses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.sharedByProperty.map((sp) => (
                      <tr key={sp.property.id}>
                        <td>
                          <strong>{sp.property.name}</strong>
                        </td>
                        <td className="code">{sp.property.code}</td>
                        <td className="num">
                          {formatKES(Number(sp.sharedExpenses))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
