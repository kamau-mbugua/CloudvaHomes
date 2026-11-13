import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api/client';
import { formatDateTime, formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { CardSkeleton } from '../../components/Loading';
import { unwrap } from '../payments/rules';
import { keys, platformErrorMessage } from '../platform/api';
import { PROVIDER_LABEL } from '../sms/rules';
import {
  niceMax,
  notSent,
  PRESET_LABEL,
  presetRange,
  rateText,
  ROUTE_LABEL,
  share,
  smsTypeLabel,
  type SmsStats,
  type StatsPreset,
} from './smsLog';

const num = (n: number) => n.toLocaleString('en-KE');

/**
 * Admin → Overview → SMS: how KodiHub's SMS did over a period — volume and success, a daily
 * chart, where messages went (provider, route, type), money from units, and the organisations
 * that need a look (running out of units, own account failing). `GET /platform/sms/stats`.
 */
export function AdminSmsDashboard() {
  const today = todayInNairobi();
  const [preset, setPreset] = useState<StatsPreset>('month');
  const range = presetRange(preset, today);
  const stats = useQuery({
    queryKey: [...keys.platform, 'sms-stats', range],
    queryFn: async () => unwrap<SmsStats>(await api.get<unknown>('/platform/sms/stats', range)),
    placeholderData: keepPreviousData,
  });

  const s = stats.data;
  return (
    <div className="smsd">
      <div className="ad__filters">
        <div className="pf__tabs" role="tablist" aria-label="Period">
          {(Object.keys(PRESET_LABEL) as StatsPreset[]).map((p) => (
            <button key={p} type="button" role="tab" className="pf__tab" aria-selected={preset === p}
              onClick={() => setPreset(p)}>
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
        <span className="ad__muted">{formatDay(range.from)} – {formatDay(range.to)}</span>
        <Link className="nx-btn nx-btn--sm" to="/admin/reports/sms">All messages</Link>
      </div>

      {stats.isError ? <p className="ad__error" role="alert">{platformErrorMessage(stats.error)}</p> : null}
      {stats.isPending ? <CardSkeleton count={4} /> : null}

      {s ? (
        <>
          <div className="ad__stats">
            <Stat label="Messages" value={num(s.totals.messages)}
              sub={`${num(s.totals.kodihubMessages)} from KodiHub · ${num(s.totals.orgMessages)} from organisations`} />
            <Stat label="Sent" value={rateText(s.totals.successRate)} sub={`${num(s.totals.sent)} accepted by the provider`} />
            <Stat label="Failed" value={num(s.totals.failed)} sub="Refused by the provider" tone={s.totals.failed ? 'bad' : undefined} />
            <Stat label="Not sent" value={num(notSent(s.totals))}
              sub={s.totals.logged
                ? `${num(s.totals.noUnits)} no units · ${num(s.totals.logged)} no provider`
                : 'Organisations out of units'}
              tone={notSent(s.totals) ? 'warn' : undefined} />
          </div>
          {s.totals.logged ? (
            <p className="ad__callout ad__callout--note" role="note">
              {num(s.totals.logged)} {s.totals.logged === 1 ? 'message was' : 'messages were'} never sent: no SMS
              provider was set up, so the server only wrote {s.totals.logged === 1 ? 'it' : 'them'} to its log.
              {' '}No units were charged for {s.totals.logged === 1 ? 'it' : 'them'}.
            </p>
          ) : null}
          <div className="ad__stats">
            <Stat label="Units used" value={num(s.totals.unitsUsed)} sub="Charged to organisations" />
            <Stat label="Units sold" value={num(s.money.unitsSold)} sub="Bundles bought" />
            <Stat label="Paid for units" value={formatKES(Number(s.money.amountPaid))} sub="By M-Pesa" />
            <Stat label="Units held now" value={num(s.money.unitsHeld)} sub="Unused, across organisations" />
          </div>

          <section className="smsd__card" aria-labelledby="smsd-daily">
            <h3 id="smsd-daily">Messages per day</h3>
            <DailyChart daily={s.daily} />
          </section>

          <div className="smsd__grid">
            <Breakdown title="By provider" empty="No messages went through a provider."
              rows={s.byProvider.map((p) => ({ key: p.provider, label: PROVIDER_LABEL[p.provider], sent: p.sent, failed: p.failed }))} />
            <Breakdown title="By route" empty="No messages."
              rows={s.byRoute.map((r) => ({ key: r.route, label: ROUTE_LABEL[r.route], sent: r.sent, failed: r.failed }))} />
          </div>

          <section className="smsd__card" aria-labelledby="smsd-types">
            <h3 id="smsd-types">By message</h3>
            {s.byType.length === 0 ? <p className="ad__muted">No messages.</p> : (
              <div className="ad__tablewrap">
                <table className="ad__table">
                  <thead>
                    <tr><th>Message</th><th>Sent by</th><th className="num">Sent</th><th className="num">Failed</th><th className="num">Not sent</th></tr>
                  </thead>
                  <tbody>
                    {s.byType.map((t) => (
                      <tr key={`${t.kind}:${t.type}`}>
                        <td>{smsTypeLabel(t.type)}</td>
                        <td>{t.kind === 'PLATFORM' ? 'KodiHub' : 'Organisations'}</td>
                        <td className="num">{num(t.sent)}</td>
                        <td className="num">{num(t.failed)}</td>
                        <td className="num">{num(notSent(t))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="smsd__grid">
            <section className="smsd__card" aria-labelledby="smsd-orgs">
              <h3 id="smsd-orgs">Top sending organisations</h3>
              {s.topOrgs.length === 0 ? <p className="ad__muted">No organisation sent SMS.</p> : (
                <div className="ad__tablewrap">
                <table className="ad__table smsd__compact">
                  <thead><tr><th>Organisation</th><th className="num">Sent</th><th className="num">Failed or not sent</th><th className="num">Units</th></tr></thead>
                  <tbody>
                    {s.topOrgs.map((o) => (
                      <tr key={o.orgId}>
                        <td><Link className="ad__link" to={`/admin/organizations/${o.orgId}`}><strong>{o.name}</strong></Link></td>
                        <td className="num">{num(o.sent)}</td>
                        <td className="num">{num(o.failed + notSent(o))}</td>
                        <td className="num">{num(o.units)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>
            <section className="smsd__card" aria-labelledby="smsd-reasons">
              <h3 id="smsd-reasons">Why messages failed</h3>
              {s.topReasons.length === 0 ? <p className="ad__muted">No failures in this period.</p> : (
                <ul className="smsd__list">
                  {s.topReasons.map((r) => (
                    <li key={r.reason}><span>{r.reason}</span><strong className="num">{num(r.count)}</strong></li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="smsd__grid">
            <section className="smsd__card" aria-labelledby="smsd-low">
              <h3 id="smsd-low">Running low on units</h3>
              <p className="ad__sub">Below their own warning level, now.</p>
              {s.lowBalance.length === 0 ? <p className="ad__muted">None.</p> : (
                <ul className="smsd__list">
                  {s.lowBalance.map((o) => (
                    <li key={o.orgId}>
                      <Link className="ad__link" to={`/admin/organizations/${o.orgId}`}><strong>{o.name}</strong></Link>
                      <span className={`ad__badge ${o.balance <= 0 ? 'ad__badge--bad' : 'ad__badge--warn'}`}>
                        {o.balance <= 0 ? 'Out of units' : `${num(o.balance)} left`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="smsd__card" aria-labelledby="smsd-failing">
              <h3 id="smsd-failing">Own SMS accounts failing</h3>
              <p className="ad__sub">Organisations sending through their own provider, now.</p>
              {s.failing.length === 0 ? <p className="ad__muted">None.</p> : (
                <ul className="smsd__list">
                  {s.failing.map((o) => (
                    <li key={o.orgId}>
                      <span>
                        <Link className="ad__link" to={`/admin/organizations/${o.orgId}`}><strong>{o.name}</strong></Link>
                        <span className="ad__sub">
                          {o.provider ? `${PROVIDER_LABEL[o.provider]} · ` : ''}since {formatDateTime(o.since)}
                          {o.reason ? ` · ${o.reason}` : ''}
                        </span>
                      </span>
                      <span className="ad__badge ad__badge--bad">Failing</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="ad__stat">
      <span className="ad__stat__label">{label}</span>
      <span className={`ad__stat__value num${tone ? ` smsd__stat--${tone}` : ''}`}>{value}</span>
      {sub ? <span className="ad__sub">{sub}</span> : null}
    </div>
  );
}

/** Horizontal bars: each row's sent share of the largest row, failures shown beside. */
function Breakdown({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { key: string; label: string; sent: number; failed: number }[];
  empty: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.sent + r.failed));
  return (
    <section className="smsd__card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="ad__muted">{empty}</p> : (
        <ul className="smsd__bars">
          {rows.map((r) => (
            <li key={r.key} title={`${r.label}: ${num(r.sent)} sent, ${num(r.failed)} failed`}>
              <span className="smsd__barlabel">{r.label}</span>
              <span className="smsd__bartrack" aria-hidden="true">
                <span className="smsd__bar smsd__bar--sent" style={{ width: `${share(r.sent, max)}%` }} />
                <span className="smsd__bar smsd__bar--failed" style={{ width: `${share(r.failed, max)}%` }} />
              </span>
              <span className="smsd__barvalue num">
                {num(r.sent)} sent{r.failed ? <span className="ad__sub">{num(r.failed)} failed · {rateText(r.sent / (r.sent + r.failed))} ok</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SERIES = [
  { key: 'sent', label: 'Sent', cls: 'smsd__bar--sent' },
  { key: 'failed', label: 'Failed', cls: 'smsd__bar--failed' },
  { key: 'noUnits', label: 'No units', cls: 'smsd__bar--nounits' },
  { key: 'logged', label: 'No provider', cls: 'smsd__bar--logged' },
] as const;

/** The element's width in CSS pixels, so the chart draws at real size (text never scales). */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setWidth(Math.max(240, Math.round(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Stacked daily bars (sent, failed, no units, no provider) on one axis, with a hover tooltip and
 * a table view.
 */
function DailyChart({ daily }: { daily: SmsStats['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [plotRef, W] = useWidth<HTMLDivElement>(720);
  const totals = daily.map((d) => d.sent + d.failed + d.noUnits + d.logged);
  const top = niceMax(Math.max(0, ...totals));
  const H = 220;
  const padL = 36;
  const padB = 22;
  const plotW = W - padL;
  const plotH = H - padB - 8;
  const slot = plotW / Math.max(1, daily.length);
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(daily.length / 8);
  const shown = hover !== null ? daily[hover] : null;

  if (totals.every((t) => t === 0)) return <p className="ad__muted">No SMS in this period.</p>;

  return (
    <div className="smsd__chart">
      <ul className="smsd__legend">
        {SERIES.map((sr) => <li key={sr.key}><span className={`smsd__swatch ${sr.cls}`} aria-hidden="true" />{sr.label}</li>)}
      </ul>
      <div className="smsd__plot" ref={plotRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
          aria-label="SMS per day: sent, failed, not sent for lack of units and not sent for lack of a provider"
          onMouseLeave={() => setHover(null)}>
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={padL} x2={W} y1={y(tk)} y2={y(tk)} className="smsd__gridline" />
              <text x={padL - 6} y={y(tk) + 4} textAnchor="end" className="smsd__axis">{num(tk)}</text>
            </g>
          ))}
          {daily.map((d, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            let base = 0;
            return (
              <g key={d.day}>
                {SERIES.map((sr) => {
                  const v = d[sr.key];
                  if (!v) return null;
                  const y0 = y(base);
                  base += v;
                  const y1 = y(base);
                  return <rect key={sr.key} x={x} y={y1} width={barW} height={Math.max(1, y0 - y1 - 1)} rx={2} className={sr.cls} />;
                })}
                <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent"
                  onMouseEnter={() => setHover(i)}>
                  <title>{`${formatDay(d.day)}: ${d.sent} sent, ${d.failed} failed, ${d.noUnits} no units, ${d.logged} no provider`}</title>
                </rect>
                {i % labelEvery === 0 ? (
                  <text x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="smsd__axis">{d.day.slice(8)}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {shown ? (
          <div className="smsd__tip" role="status">
            <strong>{formatDay(shown.day)}</strong>
            <span>
              {num(shown.sent)} sent · {num(shown.failed)} failed · {num(shown.noUnits)} no units
              {shown.logged ? ` · ${num(shown.logged)} no provider` : ''}
            </span>
          </div>
        ) : null}
      </div>
      <details className="smsd__table">
        <summary>Show as a table</summary>
        <table className="ad__table">
          <thead><tr><th>Day</th><th className="num">Sent</th><th className="num">Failed</th><th className="num">No units</th><th className="num">No provider</th></tr></thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <td>{formatDay(d.day)}</td><td className="num">{d.sent}</td><td className="num">{d.failed}</td>
                <td className="num">{d.noUnits}</td><td className="num">{d.logged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
