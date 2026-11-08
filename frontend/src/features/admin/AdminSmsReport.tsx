import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { EmptyState } from '../../components/EmptyState';
import { unwrapList } from '../payments/rules';
import { keys, platformErrorMessage } from '../platform/api';

interface SmsReportRow {
  orgId: string;
  name: string;
  unitsBought: number;
  amountPaid: string;
  unitsUsed: number;
  unitsFree: number;
}

/** Admin → Reports → SMS: units sold, paid for and used per organisation in a month. */
export function AdminSmsReport() {
  const [month, setMonth] = useState(todayInNairobi().slice(0, 7));
  const report = useQuery({
    queryKey: [...keys.reports, 'sms', month],
    queryFn: () => api.get<unknown>('/platform/reports/sms', { month }).then((b) => unwrapList<SmsReportRow>(b)),
    placeholderData: keepPreviousData,
  });
  const rows = report.data ?? [];
  const total = rows.reduce(
    (t, r) => ({
      bought: t.bought + r.unitsBought,
      paid: t.paid + Number(r.amountPaid),
      used: t.used + r.unitsUsed,
      free: t.free + r.unitsFree,
    }),
    { bought: 0, paid: 0, used: 0, free: 0 },
  );
  return (
    <>
      <div className="ad__filters">
        <label className="ad__muted">
          Month{' '}
          <input type="month" className="ad__select" value={month} max={todayInNairobi().slice(0, 7)}
            onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
      </div>
      {report.isError ? <p className="ad__error" role="alert">{platformErrorMessage(report.error)}</p> : null}
      {report.isPending ? <p className="ad__muted" role="status">Loading report…</p> : rows.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No SMS activity this month" detail="Bundles bought and messages sent show here." /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th className="num">Units bought</th>
                <th className="num">Paid</th>
                <th className="num">Units used</th>
                <th className="num">Free guest codes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orgId}>
                  <td><strong>{r.name}</strong></td>
                  <td className="num">{r.unitsBought.toLocaleString('en-KE')}</td>
                  <td className="num">{formatKES(Number(r.amountPaid))}</td>
                  <td className="num">{r.unitsUsed.toLocaleString('en-KE')}</td>
                  <td className="num">{r.unitsFree.toLocaleString('en-KE')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th className="num">{total.bought.toLocaleString('en-KE')}</th>
                <th className="num">{formatKES(total.paid)}</th>
                <th className="num">{total.used.toLocaleString('en-KE')}</th>
                <th className="num">{total.free.toLocaleString('en-KE')}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
