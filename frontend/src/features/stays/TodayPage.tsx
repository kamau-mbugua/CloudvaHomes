import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CardSkeleton, TableSkeleton } from '../../components/Loading';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { BlockSheet } from './BlockSheet';
import { BookingSheet } from './BookingSheet';
import { staysErrorMessage, staysKeys } from './api';
import { addDays } from './calendar';
import {
  dayMonth,
  greeting,
  longDate,
  monthName,
  needView,
  nightsSummary,
  payPill,
  plural,
  readyPill,
  rowAction,
  rowChip,
  rowStayText,
  shortDay,
  stayRange,
  UNIT_NOW,
  UNIT_NOW_ORDER,
  versusLastMonth,
  type DashRow,
  type HostDashboard,
} from './dashboard';
import type { CalendarUnit, Listing } from './types';

type TabKey = 'arriving' | 'leaving' | 'staying';
const TABS: [TabKey, string][] = [
  ['arriving', 'Arriving'],
  ['leaving', 'Leaving'],
  ['staying', 'Staying'],
];

const dashboardKey = (propertyId: string | undefined) =>
  [...staysKeys.bookings, 'dashboard', { propertyId }] as const;

/** The host's home: today's arrivals and departures, what needs them, and how full they are. */
export function TodayPage() {
  const session = useSession();
  const perms = new Set(session.permissions);
  const canUpdate = perms.has('bookings:update');
  const canCreate = perms.has('bookings:create');
  const canPrompt = perms.has('stay-payments:create');
  const canSeeCleaning = perms.has('cleaning:view');
  const propertyId = session.activePropertyId ?? undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey | null>(null);
  const [sheet, setSheet] = useState<'booking' | 'block' | null>(null);
  // Read once: the greeting needn't change while the page is open.
  const [hour] = useState(() => new Date().getHours());

  const query = useQuery({
    queryKey: dashboardKey(propertyId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (propertyId) params.set('propertyId', propertyId);
      const qs = params.toString();
      const res = await api.get<DataEnvelope<HostDashboard>>(`/host/dashboard${qs ? `?${qs}` : ''}`);
      return res.data;
    },
  });

  const listingsQuery = useQuery({
    queryKey: [...staysKeys.listings, 'dashboard-sheet', { propertyId }],
    enabled: sheet === 'booking',
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (propertyId) params.set('propertyId', propertyId);
      return (await api.get<PageEnvelope<Listing>>(`/host/listings?${params.toString()}`)).data;
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: staysKeys.bookings });
    await queryClient.invalidateQueries({ queryKey: staysKeys.calendar });
    await queryClient.invalidateQueries({ queryKey: staysKeys.cleaning });
  };

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: 'check-in' | 'check-out' | 'no-show' }) =>
      api.post(`/host/bookings/${id}/${act}`, {}),
    onSuccess: async (_res, vars) => {
      toast.saved(
        vars.act === 'check-in' ? 'Guest checked in.' : vars.act === 'check-out' ? 'Guest checked out.' : 'Marked as no-show.',
      );
      await refresh();
    },
    onError: (err) => toast.failed(staysErrorMessage(err)),
  });

  const prompt = useMutation({
    mutationFn: (id: string) => api.post(`/host/bookings/${id}/mpesa-prompt`, {}),
    onSuccess: () => toast.saved('M-Pesa prompt sent to the guest.'),
    onError: (err) => toast.failed(staysErrorMessage(err)),
  });

  const d = query.data;
  const firstName = session.user.firstName;

  if (query.isError) {
    return (
      <div className="pg">
        <p className="ad__muted">{staysErrorMessage(query.error)}</p>
        <button type="button" className="nx-btn" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const activeTab: TabKey =
    tab ?? (d && d.stays.arriving.length === 0 && d.stays.staying.some((r) => r.stage === 'OVERDUE') ? 'staying' : 'arriving');

  const runRow = (r: DashRow) => {
    const a = rowAction(r);
    if (a.action === 'open' || !canUpdate) navigate(`/app/bookings/${r.id}`);
    else action.mutate({ id: r.id, act: a.action });
  };

  const blockUnits: CalendarUnit[] =
    d?.units.groups.flatMap((g) =>
      g.units.map((u) => ({
        unitId: u.unitId,
        listingId: u.listingId,
        unitNumber: u.number,
        title: u.title,
        property: g.property,
      })),
    ) ?? [];

  return (
    <div className="pg hd">
      <header className="hd__head">
        <div className="hd__title">
          <span className="hd__muted">
            {greeting(hour)}
            {firstName ? `, ${firstName}` : ''}
          </span>
          <h1>{d ? longDate(d.today) : ' '}</h1>
          {d && d.summary.units > 0 && (
            <span className="hd__muted">
              {d.summary.properties.map((p) => p.name).join(' and ')} · {plural(d.summary.units, 'unit')}
            </span>
          )}
        </div>
        <div className="hd__actions">
          {canCreate && (
            <button type="button" className="nx-btn" onClick={() => setSheet('block')} disabled={!d}>
              Block dates
            </button>
          )}
          <Link to="/app/calendar" className="nx-btn">
            Open calendar
          </Link>
          {canCreate && (
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setSheet('booking')}>
              + New booking
            </button>
          )}
        </div>
      </header>

      {!d ? (
        <>
          <CardSkeleton count={4} />
          <TableSkeleton rows={4} />
        </>
      ) : d.summary.units === 0 ? (
        <section className="hd__card hd__empty">
          <h2>No listings yet</h2>
          <p className="hd__muted">Add a listing to see your arrivals, departures and occupancy here.</p>
          <Link to="/app/listings/new" className="nx-btn nx-btn--primary">
            Add a listing
          </Link>
        </section>
      ) : (
        <>
          <Kpis d={d} canSeeCleaning={canSeeCleaning} />

          <div className="hd__row">
            <section className="hd__card hd__wide" aria-labelledby="hd-today">
              <div className="hd__cardhead">
                <h2 id="hd-today">Today at your units</h2>
                <div role="tablist" aria-label="Today" className="hd__tabs">
                  {TABS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === key}
                      className="hd__tab"
                      onClick={() => setTab(key)}
                    >
                      {label} <span className="hd__tabcount">{d.stays[key].length}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div role="tabpanel">
                {d.stays[activeTab].length === 0 ? (
                  <p className="hd__muted hd__none">
                    {activeTab === 'arriving'
                      ? 'No one arrives today.'
                      : activeTab === 'leaving'
                        ? 'No one leaves today.'
                        : 'No guests are staying right now.'}
                  </p>
                ) : (
                  d.stays[activeTab].map((r) => {
                    const chip = rowChip(r);
                    const pay = payPill(r);
                    const ready = readyPill(r);
                    const act = rowAction(r);
                    const busy = action.isPending && action.variables?.id === r.id;
                    return (
                      <div key={r.id} className="hd__stay">
                        <div className={`hd__chip hd__chip--${chip.tone}`}>
                          <strong>{chip.top}</strong>
                          <span>{chip.bottom}</span>
                        </div>
                        <div className="hd__stayinfo">
                          <div className="hd__stayname">
                            <Link to={`/app/bookings/${r.id}`}>{r.guestName ?? 'Guest'}</Link>
                            <span className="hd__code">{r.code}</span>
                          </div>
                          <span className="hd__muted hd__small">
                            {r.unit.title} · {r.unit.propertyName} {r.unit.number} · {rowStayText(r)}
                          </span>
                          {(pay || ready) && (
                            <div className="hd__pills">
                              {pay && <span className={`hd__pill hd__pill--${pay.tone}`}>{pay.label}</span>}
                              {ready && <span className={`hd__pill hd__pill--${ready.tone}`}>{ready.label}</span>}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`nx-btn ${act.primary && canUpdate && act.action !== 'open' ? 'nx-btn--primary' : ''}`}
                          disabled={busy}
                          onClick={() => runRow(r)}
                        >
                          {canUpdate ? act.label : 'Open'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="hd__card hd__side" aria-labelledby="hd-needs">
              <div className="hd__cardhead">
                <h2 id="hd-needs">Needs you</h2>
                {d.needs.length > 0 && <span className="hd__pill hd__pill--bad">{d.needs.length}</span>}
              </div>
              {d.needs.length === 0 ? (
                <p className="hd__muted">Nothing needs you right now.</p>
              ) : (
                d.needs.map((n) => {
                  const v = needView(n);
                  const busy = action.isPending && action.variables?.id === n.booking.id;
                  const go = () => {
                    switch (v.action.kind) {
                      case 'check-out':
                      case 'no-show':
                        if (canUpdate) action.mutate({ id: n.booking.id, act: v.action.kind });
                        else navigate(`/app/bookings/${n.booking.id}`);
                        break;
                      case 'open-cleaning':
                        navigate('/app/cleaning');
                        break;
                      default:
                        navigate(`/app/bookings/${n.booking.id}`);
                    }
                  };
                  const needsUpdate = v.action.kind === 'check-out' || v.action.kind === 'no-show';
                  return (
                    <div key={`${n.kind}-${n.booking.id}`} className={`hd__need hd__need--${v.tone}`}>
                      <span className="hd__needdot" aria-hidden="true" />
                      <div className="hd__needbody">
                        <strong>{v.title}</strong>
                        <span>{v.detail}</span>
                        <div className="hd__needactions">
                          <button type="button" className="nx-btn nx-btn--primary nx-btn--sm" disabled={busy} onClick={go}>
                            {needsUpdate && !canUpdate ? 'Open' : v.action.label}
                          </button>
                          {needsUpdate && canUpdate && (
                            <Link to={`/app/bookings/${n.booking.id}`} className="nx-btn nx-btn--sm">
                              Open
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>

          <div className="hd__row">
            <NightsChart d={d} />
            <UnitsNow d={d} />
          </div>

          {d.summary.money && (
            <section id="balances" className="hd__card" aria-labelledby="hd-bal">
              <div className="hd__cardhead">
                <h2 id="hd-bal">Balances due</h2>
                <Link to="/app/bookings" className="hd__link">
                  All bookings
                </Link>
              </div>
              {d.balances.length === 0 ? (
                <p className="hd__muted">No guest owes you anything that is due.</p>
              ) : (
                <div className="ad__tablewrap">
                  <table className="ad__table hd__table">
                    <thead>
                      <tr>
                        <th>Booking</th>
                        <th>Guest</th>
                        <th>Unit</th>
                        <th>Stay</th>
                        <th className="num">Paid</th>
                        <th className="num">Balance</th>
                        <th>
                          <span className="nx-sr">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.balances.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <Link to={`/app/bookings/${b.id}`} className="ad__link code">
                              {b.code}
                            </Link>
                          </td>
                          <td>{b.guestName ?? '—'}</td>
                          <td>
                            <strong>{b.unit.title}</strong>
                            <span className="ad__sub">
                              {b.unit.propertyName} · {b.unit.number}
                            </span>
                          </td>
                          <td>
                            {stayRange(b.checkIn, b.checkOut)}
                            <StageNote r={b} />
                          </td>
                          <td className="num">
                            {formatKES(Number(b.paid ?? '0'))} of {formatKES(Number(b.total ?? '0'))}
                          </td>
                          <td className="num hd__owed">{formatKES(Number(b.owed ?? '0'))}</td>
                          <td className="ad__rowactions">
                            {b.stage === 'NEVER_ARRIVED' || !canPrompt ? (
                              <Link to={`/app/bookings/${b.id}`} className="nx-btn nx-btn--sm">
                                {b.stage === 'NEVER_ARRIVED' ? 'Resolve' : 'Open'}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="nx-btn nx-btn--sm"
                                disabled={prompt.isPending && prompt.variables === b.id}
                                onClick={() => prompt.mutate(b.id)}
                              >
                                Send M-Pesa prompt
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {sheet === 'booking' && listingsQuery.data && (
        <BookingSheet listings={listingsQuery.data} onClose={() => setSheet(null)} />
      )}
      {sheet === 'block' && d && (
        <BlockSheet units={blockUnits} initialFrom={d.today} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

function StageNote({ r }: { r: DashRow }) {
  const note: Partial<Record<DashRow['stage'], [string, string]>> = {
    ARRIVES_TODAY: ['Arrives today', 'ok'],
    NEVER_ARRIVED: ['Never checked in', 'bad'],
    IN_HOUSE: ['In the house', 'plain'],
    LEAVES_TODAY: ['Leaves today', 'plain'],
    OVERDUE: ['Check-out overdue', 'bad'],
    CHECKED_OUT: ['Checked out', 'plain'],
  };
  const n = note[r.stage];
  if (!n) return null;
  return <span className={`hd__stage hd__stage--${n[1]}`}>{n[0]}</span>;
}

function Kpis({ d, canSeeCleaning }: { d: HostDashboard; canSeeCleaning: boolean }) {
  const money = d.summary.money;
  const tonightPct = Math.round(d.summary.occupancyTonight * 100);
  const monthPct = Math.round(d.summary.occupancyMonth * 100);
  const lastMonthName = monthName(addDays(`${d.today.slice(0, 7)}-01`, -1));
  const vs = money ? versusLastMonth(BigInt(money.collectedThisMonth), BigInt(money.collectedLastMonth), lastMonthName) : null;
  const daily = money?.dailyThisMonth.map((v) => Math.max(0, Number(v))) ?? [];
  const peak = Math.max(1, ...daily);

  return (
    <section aria-label="This month at a glance" className="hd__kpis">
      {money && (
        <div className="hd__card hd__kpi">
          <span className="hd__kpilabel">Collected this month</span>
          <span className="hd__kpivalue num">{formatKES(Number(money.collectedThisMonth))}</span>
          <div className="hd__spark" aria-hidden="true">
            {daily.map((v, i) => (
              <span
                key={i}
                className={i === daily.length - 1 ? 'is-today' : undefined}
                style={{ height: `${Math.max(8, Math.round((v / peak) * 100))}%` }}
              />
            ))}
          </div>
          <span className={vs?.up === false ? 'hd__muted hd__small' : 'hd__good hd__small'}>
            {vs?.text ?? `Nothing collected in ${lastMonthName}`}
          </span>
        </div>
      )}
      <div className="hd__card hd__kpi">
        <span className="hd__kpilabel">Occupied tonight</span>
        <span className="hd__kpivalue num">
          {d.summary.occupiedTonight} <small>of {plural(d.summary.units, 'unit')}</small>
        </span>
        <div className="hd__meter" role="img" aria-label={`${tonightPct} percent occupied`}>
          <div style={{ width: `${tonightPct}%` }} />
        </div>
        <span className="hd__muted hd__small">
          {tonightPct}% tonight · {monthPct}% this month
        </span>
      </div>
      {money && (
        <div className="hd__card hd__kpi">
          <span className="hd__kpilabel">Still owed by guests</span>
          <span className={`hd__kpivalue num ${BigInt(money.owed) > 0n ? 'hd__owed' : ''}`}>
            {formatKES(Number(money.owed))}
          </span>
          <span className="hd__muted hd__small hd__kpinote">
            {money.owedBookings === 0
              ? 'Every balance that is due is paid'
              : `${plural(money.owedBookings, 'booking')}${money.owedOldestSince ? ` · oldest since ${dayMonth(money.owedOldestSince)}` : ''}`}
          </span>
          {money.owedBookings > 0 && (
            <a href="#balances" className="hd__link">
              Send M-Pesa prompts
            </a>
          )}
        </div>
      )}
      {canSeeCleaning && d.summary.toClean !== null && (
        <div className="hd__card hd__kpi">
          <span className="hd__kpilabel">Units to clean</span>
          <span className="hd__kpivalue num">{d.summary.toClean}</span>
          <span className={`hd__small hd__kpinote ${d.summary.toCleanBeforeArrival ? 'hd__warn' : 'hd__muted'}`}>
            {d.summary.toCleanBeforeArrival
              ? `${d.summary.toCleanBeforeArrival} must be ready for an arrival today`
              : d.summary.toClean === 0
                ? 'All units are clean'
                : 'None needed for an arrival today'}
          </span>
          <Link to="/app/cleaning" className="hd__link">
            Open cleaning
          </Link>
        </div>
      )}
    </section>
  );
}

function NightsChart({ d }: { d: HostDashboard }) {
  const units = Math.max(1, d.summary.units);
  const avg = d.nights.length
    ? Math.round((d.nights.reduce((s, n) => s + n.booked, 0) / (d.nights.length * units)) * 100)
    : 0;
  const label = `Units booked each night for the next ${d.nights.length} nights: ${d.nights
    .map((n) => `${shortDay(n.date)} ${n.booked}`)
    .join(', ')}, of ${d.summary.units}`;
  return (
    <section className="hd__card hd__wide" aria-labelledby="hd-nights">
      <div className="hd__cardhead">
        <h2 id="hd-nights">Next {d.nights.length} nights</h2>
        <span className="hd__muted hd__small">
          Units booked of {d.summary.units} · average {avg}%
        </span>
      </div>
      <div className="hd__chartwrap">
        <div className="hd__bars" role="img" aria-label={label}>
          {d.nights.map((n, i) => (
            <div key={n.date} className={`hd__bar ${i === 0 ? 'is-today' : ''}`}>
              <span>{n.booked}</span>
              <div style={{ height: `${(n.booked / units) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="hd__barlabels" aria-hidden="true">
          {d.nights.map((n, i) => {
            const [dow, day] = shortDay(n.date).split(' ');
            const first = day === '1' ? ` ${dayMonth(n.date).split(' ')[1]}` : '';
            return (
              <span key={n.date} className={i === 0 ? 'is-today' : undefined}>
                {dow}
                <br />
                {day}
                {first}
              </span>
            );
          })}
        </div>
      </div>
      <span className="hd__muted hd__small">{nightsSummary(d.nights, d.summary.units)}</span>
    </section>
  );
}

function UnitsNow({ d }: { d: HostDashboard }) {
  const shown = UNIT_NOW_ORDER.filter((s) => d.units.counts[s] > 0);
  const label = shown.map((s) => `${d.units.counts[s]} ${UNIT_NOW[s].label}`).join(', ');
  return (
    <section className="hd__card hd__side" aria-labelledby="hd-units">
      <h2 id="hd-units">Units right now</h2>
      <div className="hd__stack" role="img" aria-label={label}>
        {shown.map((s) => (
          <span key={s} className={`hd__u--${s}`} style={{ flex: d.units.counts[s] }} />
        ))}
      </div>
      <div className="hd__legend">
        {shown.map((s) => (
          <span key={s}>
            <i className={`hd__u--${s}`} />
            {d.units.counts[s]} {UNIT_NOW[s].label}
          </span>
        ))}
      </div>
      {d.units.groups.map((g) => (
        <div key={g.property.id} className="hd__group">
          <span className="hd__groupname">{g.property.name}</span>
          <div className="hd__unitgrid">
            {g.units.map((u) => (
              <span key={u.unitId} className={`hd__unit hd__u--${u.status}`} title={`${u.title}: ${UNIT_NOW[u.status].label}`}>
                <span className="hd__code">{u.number}</span>
                <small>{UNIT_NOW[u.status].short}</small>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
