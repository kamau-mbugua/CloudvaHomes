import { useState } from 'react';
import type { ReactNode } from 'react';
import { formatDateTime, formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { MonthPicker } from '../billing/ui';
import { SignedAmount } from '../payments/ui';
import { personName } from '../portfolio/labels';
import { Badge } from '../portfolio/ui';
import { agencyErrorMessage } from './api';
import { PAYOUT_METHOD, REMITTANCE_STATUS } from './labels';
import { describeNet, describePayable, groupCollections, rangeText } from './rules';
import { formatRate } from '../reports/rules';
import type { OccupancyReport } from '../reports/types';
import type { OwnerStatement, Remittance } from './types';

/**
 * Pieces the agency screens and the owner portal share: balance tiles, the month-range
 * bar, the owner statement and the payouts list. Laid out as stacked rows rather than
 * wide tables, so they read on a 390px phone — where landlords mostly look.
 */

/** Payable (signed, negative in the warning colour with its meaning) and deposits held. */
export function BalanceTiles({ payable, depositHeld, audience = 'agency' }: {
  payable: number | null;
  depositHeld: number | null;
  audience?: 'agency' | 'owner';
}) {
  return (
    <div className="ad__stats pf__stats ag__tiles">
      <div className="ad__stat">
        <span className="ad__stat__label">{audience === 'owner' ? 'Your balance with the agency' : 'Payable to landlord'}</span>
        <span className="ad__stat__value">{payable === null ? '—' : <SignedAmount minor={payable} />}</span>
        {payable !== null ? <span className={`ad__sub ${payable < 0 ? 'ag__negnote' : ''}`}>{describePayable(payable, audience)}</span> : null}
      </div>
      <div className="ad__stat">
        <span className="ad__stat__label">Deposits held</span>
        <span className="ad__stat__value num">{depositHeld === null ? '—' : formatKES(depositHeld)}</span>
        <span className="ad__sub">{audience === 'owner' ? 'Tenants’ deposits the agency keeps for you' : 'Tenants’ deposits kept by the agency'}</span>
      </div>
    </div>
  );
}

/** First and last month, plus "Download PDF". */
export function MonthRangeBar({ from, to, max, onChange, onDownload, disabled, children }: {
  from: string;
  to: string;
  max: string;
  onChange: (range: { from: string; to: string }) => void;
  onDownload: () => Promise<void>;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await onDownload();
    } catch (error) {
      toast.failed(agencyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ad__filters ag__rangebar">
      {children}
      <MonthPicker label="First month" value={from} max={to} onChange={(p) => onChange({ from: p, to })} />
      <span className="ad__muted ag__rangeto">to</span>
      <MonthPicker label="Last month" value={to} max={max} onChange={(p) => onChange({ from: from > p ? p : from, to: p })} />
      <button type="button" className="nx-btn pg-push" onClick={download} disabled={busy || disabled}>
        {busy ? 'Preparing…' : 'Download PDF'}
      </button>
    </div>
  );
}

function Line({ label, sub, minor, tone }: { label: ReactNode; sub?: ReactNode; minor: number; tone?: 'edge' | 'detail' | 'head' }) {
  return (
    <li className={`ag__line ${tone ? `ag__line--${tone}` : ''}`}>
      <span className="ag__linelabel">{label}{sub ? <span className="ad__sub">{sub}</span> : null}</span>
      <SignedAmount minor={minor} />
    </li>
  );
}

/**
 * An owner statement: opening balance, collections per property and unit (with the
 * tenant), commission, expenses, adjustments, payouts, closing balance; deposits held;
 * occupancy and arrears of the landlord's properties.
 *
 * `totals` gives commission, expenses and payouts as positive deductions; here they are
 * shown negative, so every line reads the ledger's way (+ owed to the landlord).
 */
export function StatementView({ statement: s, audience = 'agency' }: { statement: OwnerStatement; audience?: 'agency' | 'owner' }) {
  const groups = groupCollections(s.entries ?? []);
  const t = s.totals;

  return (
    <div className="ag__stmt">
      <div className="ad__stats pf__stats ag__tiles">
        <div className="ad__stat">
          <span className="ad__stat__label">Opening · {formatPeriod(s.from)}</span>
          <span className="ad__stat__value"><SignedAmount minor={s.opening.payable} /></span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Closing · end of {formatPeriod(s.to)}</span>
          <span className="ad__stat__value"><SignedAmount minor={s.closing.payable} /></span>
          <span className={`ad__sub ${s.closing.payable < 0 ? 'ag__negnote' : ''}`}>{describePayable(s.closing.payable, audience)}</span>
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Deposits held</span>
          <span className="ad__stat__value num">{formatKES(s.closing.depositHeld)}</span>
        </div>
      </div>

      <section className="ag__card" aria-labelledby="stmt-money">
        <h3 id="stmt-money">Money in and out · {rangeText(s.from, s.to)}</h3>
        <ul className="ag__lines">
          <Line tone="edge" label="Opening balance" minor={s.opening.payable} />
          <Line tone="head" label="Collected from tenants" minor={t.collections} />
          {groups.map((g) => (
            <li key={g.key} className="ag__group">
              <details open={groups.length <= 3}>
                <summary className="ag__line ag__line--sub">
                  <span className="ag__linelabel">{g.property?.name ?? 'Other'}{g.property ? <span className="ad__sub num">{g.property.code}</span> : null}</span>
                  <SignedAmount minor={g.total} />
                </summary>
                <ul className="ag__lines">
                  {g.rows.map((row) => (
                    <Line key={row.id} tone="detail"
                      label={`${formatDay(row.occurredAt.slice(0, 10))}${row.unit ? ` · Unit ${row.unit.number}` : ''}`}
                      sub={row.tenant ? personName(row.tenant) : row.memo ?? undefined}
                      minor={row.amount} />
                  ))}
                </ul>
              </details>
            </li>
          ))}
          <Line label="Commission" minor={-t.commission} />
          <Line label="Expenses on the properties" minor={-t.expenses} />
          {t.adjustments ? <Line label="Adjustments" minor={t.adjustments} /> : null}
          <Line label="Paid out" minor={-t.remittances} />
          <Line tone="edge" label="Closing balance" minor={s.closing.payable} />
        </ul>
        <p className="hint ag__note">
          Amounts in red reduce the balance. {audience === 'owner'
            ? 'A positive balance is money the agency holds for you; a negative one is what you owe the agency.'
            : 'A positive balance is money the agency holds for the landlord; a negative one is what the landlord owes the agency.'}
          {' '}Deposits held went from <span className="num">{formatKES(s.opening.depositHeld)}</span> to <span className="num">{formatKES(s.closing.depositHeld)}</span>.
        </p>
      </section>

      {s.occupancy && s.occupancy.rows.length > 0 ? <OccupancySummary report={s.occupancy} /> : null}
      {s.arrears ? <ArrearsSummary arrears={s.arrears} /> : null}
    </div>
  );
}

/** Occupancy per property, as cards. */
export function OccupancySummary({ report, title = 'Occupancy now' }: { report: OccupancyReport; title?: string }) {
  return (
    <section className="ag__card" aria-label={title}>
      <h3>{title} <span className="ad__muted">· {formatRate(report.totals.rate)} let</span></h3>
      <ul className="ag__props">
        {report.rows.map((row) => (
          <li key={row.property.id} className="ag__prop">
            <div className="ag__prophead">
              <strong>{row.property.name}</strong>
              <span className="ad__sub num">{row.property.code}</span>
            </div>
            <dl className="ag__propfacts">
              <div><dt>Units</dt><dd className="num">{row.units}</dd></div>
              <div><dt>Occupied</dt><dd className="num">{row.occupied + row.notice}</dd></div>
              <div><dt>Vacant</dt><dd className="num">{row.vacant}</dd></div>
              <div><dt>Let</dt><dd className="num">{formatRate(row.rate)}</dd></div>
            </dl>
            {row.vacantUnits.length > 0 ? (
              <p className="ad__sub">Vacant: {row.vacantUnits.map((u) => u.number).join(', ')}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What tenants on the landlord's properties owe now. */
export function ArrearsSummary({ arrears, title = 'Tenants who owe' }: { arrears: NonNullable<OwnerStatement['arrears']>; title?: string }) {
  const rows = arrears.rows ?? [];
  const total = arrears.totals?.total ?? rows.reduce((sum, r) => sum + r.total, 0);
  return (
    <section className="ag__card" aria-label={title}>
      <h3>{title} <span className="ad__muted">· <span className={`num ${total > 0 ? 'ad__owed' : ''}`}>{formatKES(total)}</span></span></h3>
      {rows.length === 0 ? <p className="ad__muted">Nobody owes anything right now.</p> : (
        <ul className="ag__lines">
          {rows.map((r, i) => (
            <li key={`${r.tenant.code}-${i}`} className="ag__line">
              <span className="ag__linelabel">
                {personName(r.tenant)}
                <span className="ad__sub">{r.units.length ? `Unit ${r.units.join(', ')}` : r.tenant.code}{r.overdue > 0 ? ` · ${formatKES(r.overdue)} overdue` : ''}</span>
              </span>
              <span className={`num ${r.overdue > 0 ? 'ad__owed' : ''}`}>{formatKES(r.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Payouts as cards — the owner portal's list. */
export function PayoutCards({ rows }: { rows: Remittance[] }) {
  return (
    <ul className="ag__payouts">
      {rows.map((r) => (
        <li key={r.id} className="ag__payout">
          <div className="ag__payouthead">
            <div>
              <strong>{formatPeriod(r.period, true)}</strong>
              <span className="ad__sub num">{r.number}</span>
            </div>
            <Badge table={REMITTANCE_STATUS} value={r.status} />
          </div>
          <p className={`ag__payoutamt num ${r.direction === 'FROM_LANDLORD' ? 'py__neg' : ''}`}>{describeNet(r, 'owner')}</p>
          {r.status === 'PAID' ? (
            <p className="ad__muted">
              Paid {formatDateTime(r.paidAt)}{r.method ? ` · ${PAYOUT_METHOD[r.method] ?? r.method}` : ''}
              {r.reference ? <> · <span className="num">{r.reference}</span></> : null}
              {r.payoutMasked ? <> · to <span className="num">{r.payoutMasked}</span></> : null}
            </p>
          ) : r.status === 'CANCELLED' ? (
            <p className="ad__muted">Cancelled{r.cancelledReason ? `: ${r.cancelledReason}` : ''}</p>
          ) : (
            <p className="ad__muted">Being prepared by the agency.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
