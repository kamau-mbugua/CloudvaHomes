import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { unwrapList } from '../payments/rules';
import { keys, platformErrorMessage } from '../platform/api';
import { AdminSmsMessages } from './AdminSmsMessages';
import { monthRange } from './smsLog';

interface SmsReportRow {
  orgId: string;
  name: string;
  unitsBought: number;
  amountPaid: string;
  unitsUsed: number;
  unitsFree: number;
}

/**
 * Admin → Reports → SMS. "By organisation": units sold, paid for and used per organisation in
 * a month; a row opens that organisation's messages for the month. "All messages": every SMS
 * on KodiHub, its own included.
 */
export function AdminSmsReport() {
  const [view, setView] = useState<'orgs' | 'all'>('orgs');
  return (
    <>
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="SMS report views">
          <button type="button" role="tab" aria-selected={view === 'orgs'} className="pf__tab" onClick={() => setView('orgs')}>
            By organisation
          </button>
          <button type="button" role="tab" aria-selected={view === 'all'} className="pf__tab" onClick={() => setView('all')}>
            All messages
          </button>
        </div>
      </div>
      {view === 'orgs' ? <ByOrganisation /> : <AdminSmsMessages />}
    </>
  );
}

function ByOrganisation() {
  const today = todayInNairobi();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [opened, setOpened] = useState<SmsReportRow | null>(null);
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
  const period = monthRange(month, today);
  return (
    <>
      {opened ? (
        <Sheet title={`${opened.name}: SMS`} wide onClose={() => setOpened(null)}
          footer={<button type="button" className="nx-btn nx-btn--primary" onClick={() => setOpened(null)}>Done</button>}>
          <p className="ad__muted">Messages from {formatDay(period.from)} to {formatDay(period.to)}.</p>
          <AdminSmsMessages orgId={opened.orgId} from={period.from} to={period.to} />
        </Sheet>
      ) : null}
      <div className="ad__filters">
        <label className="ad__muted">
          Month{' '}
          <input type="month" className="ad__select" value={month} max={today.slice(0, 7)}
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
                <th><span className="sr-only">Actions</span></th>
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
                  <td className="ad__rowactions">
                    <div>
                      <button type="button" className="nx-btn nx-btn--sm" onClick={() => setOpened(r)}
                        aria-label={`View the SMS ${r.name} sent this month`}>
                        Messages
                      </button>
                    </div>
                  </td>
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
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
