import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton, TableSkeleton } from '../../components/Loading';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { staysKeys } from './api';
import { addDays, bookingStatusBadge, daysBetween, todayIso } from './calendar';
import type { HostCleaningTask } from './ops';
import type { Booking, Listing } from './types';

function formatTimeLeft(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '—';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Expiring soon';
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.max(1, Math.floor((diffMs % 3_600_000) / 60_000));
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

export function TodayPage() {
  const session = useSession();
  const perms = new Set(session?.permissions ?? []);
  const canSeeMoney = perms.has('stay-payments:view');
  const canSeeCleaning = perms.has('cleaning:view');
  const activePropertyId = session?.activePropertyId ?? undefined;
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonthStart = `${addDays(monthStart, 31).slice(0, 7)}-01`;

  const bookingsQuery = useQuery({
    queryKey: [
      ...staysKeys.bookings,
      'today-board',
      { propertyId: activePropertyId },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (activePropertyId) params.set('propertyId', activePropertyId);
      const res = await api.get<PageEnvelope<Booking>>(
        `/host/bookings?${params.toString()}`,
      );
      return res.data;
    },
  });

  const listingsQuery = useQuery({
    queryKey: [
      ...staysKeys.listings,
      'today-board',
      { propertyId: activePropertyId },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (activePropertyId) params.set('propertyId', activePropertyId);
      const res = await api.get<PageEnvelope<Listing>>(
        `/host/listings?${params.toString()}`,
      );
      return res.data;
    },
  });

  const cleaningQuery = useQuery({
    queryKey: [
      ...staysKeys.cleaning,
      'today-board',
      { propertyId: activePropertyId },
    ],
    enabled: canSeeCleaning,
    queryFn: async () => {
      const params = new URLSearchParams({ status: 'OPEN', pageSize: '50' });
      if (activePropertyId) params.set('propertyId', activePropertyId);
      const res = await api.get<PageEnvelope<HostCleaningTask>>(
        `/host/cleaning?${params.toString()}`,
      );
      return res.data;
    },
  });

  const all = bookingsQuery.data ?? [];
  const listings = listingsQuery.data ?? [];
  const cleaningTasks = cleaningQuery.data ?? [];

  const arrivals = all.filter(
    (b) =>
      b.checkIn === today && (b.status === 'CONFIRMED' || b.status === 'HELD'),
  );
  const departures = all.filter(
    (b) =>
      b.checkOut === today &&
      (b.status === 'CHECKED_IN' || b.status === 'CONFIRMED'),
  );
  const inHouse = all.filter(
    (b) =>
      b.status === 'CHECKED_IN' ||
      (b.status === 'CONFIRMED' && b.checkIn <= today && b.checkOut > today),
  );
  const requests = all.filter((b) => b.status === 'REQUESTED');
  const balancesDue = all.filter((b) => {
    if (b.total === undefined) return false;
    if (
      b.status !== 'CONFIRMED' &&
      b.status !== 'CHECKED_IN' &&
      b.status !== 'HELD'
    ) {
      return false;
    }
    const net = BigInt(b.amountPaid ?? '0') - BigInt(b.amountRefunded ?? '0');
    return BigInt(b.total) > net;
  });

  let monthlyIncome = 0n;
  let monthlyOwed = 0n;
  let bookedNightsThisMonth = 0;

  for (const b of all) {
    if (
      b.status === 'CONFIRMED' ||
      b.status === 'CHECKED_IN' ||
      b.status === 'COMPLETED'
    ) {
      if (b.checkIn < nextMonthStart && b.checkOut > monthStart) {
        const net =
          BigInt(b.amountPaid ?? '0') - BigInt(b.amountRefunded ?? '0');
        monthlyIncome += net > 0n ? net : 0n;
        const tot = BigInt(b.total ?? '0');
        if (tot > net) monthlyOwed += tot - net;

        const start = b.checkIn < monthStart ? monthStart : b.checkIn;
        const end = b.checkOut > nextMonthStart ? nextMonthStart : b.checkOut;
        bookedNightsThisMonth += Math.max(0, daysBetween(start, end));
      }
    }
  }

  const totalAvailableNights = Math.max(1, listings.length * 30);
  const occupancyPct =
    listings.length > 0
      ? Math.min(
          100,
          Math.round((bookedNightsThisMonth / totalAvailableNights) * 100),
        )
      : 0;

  return (
    <div className="pg">
      <div className="ad__filters">
        <span className="ad__sub">Today · {today}</span>
        <div className="bl__headbtns pg-push">
          <Link to="/app/calendar" className="nx-btn">
            Open calendar
          </Link>
          <Link to="/app/bookings" className="nx-btn nx-btn--primary">
            All bookings
          </Link>
        </div>
      </div>

      {bookingsQuery.isLoading ? (
        <CardSkeleton count={canSeeMoney ? 3 : 2} />
      ) : (
        <div className="ad__stats">
          {canSeeMoney && (
            <div className="ad__stat">
              <span className="ad__stat__label">This month’s income</span>
              <span className="ad__stat__value num">
                {formatKES(Number(monthlyIncome))}
              </span>
            </div>
          )}
          <div className="ad__stat">
            <span className="ad__stat__label">
              Occupancy ({today.slice(0, 7)})
            </span>
            <span className="ad__stat__value num">{occupancyPct}%</span>
            <span className="ad__sub">
              {inHouse.length} in-house across {listings.length} units
            </span>
          </div>
          {canSeeMoney && (
            <div className="ad__stat">
              <span className="ad__stat__label">Balances owed</span>
              <span className="ad__stat__value num">
                {formatKES(Number(monthlyOwed))}
              </span>
            </div>
          )}
          {canSeeCleaning && (
            <div className="ad__stat">
              <span className="ad__stat__label">Units to clean</span>
              <span className="ad__stat__value num">
                {cleaningTasks.length}
              </span>
            </div>
          )}
        </div>
      )}

      {bookingsQuery.isLoading ? (
        <TableSkeleton rows={4} />
      ) : (
        <>
          <BookingSection
            title="Arrivals today"
            count={arrivals.length}
            items={arrivals}
            showMoney={canSeeMoney}
          />
          <BookingSection
            title="Departures today"
            count={departures.length}
            items={departures}
            showMoney={canSeeMoney}
          />
          <BookingSection
            title="In-house"
            count={inHouse.length}
            items={inHouse}
            showMoney={canSeeMoney}
          />

          <section className="fm__section">
            <h2>Requests waiting ({requests.length})</h2>
            <div className="ad__tablewrap">
              {requests.length === 0 ? (
                <p className="ad__muted">None right now.</p>
              ) : (
                <table className="ad__table">
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Guest</th>
                      <th>Unit</th>
                      <th>Dates</th>
                      <th>Time left</th>
                      {canSeeMoney && <th className="num">Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <Link
                            to={`/app/bookings/${b.id}`}
                            className="ad__link code"
                          >
                            {b.code}
                          </Link>
                        </td>
                        <td>{b.guest?.name ?? '—'}</td>
                        <td>
                          <strong>{b.listing.title}</strong>
                          <span className="ad__sub">
                            {b.property.name} · {b.unit.number}
                          </span>
                        </td>
                        <td>
                          {b.checkIn} → {b.checkOut}
                        </td>
                        <td>
                          <span className="ad__badge ad__badge--warn">
                            {formatTimeLeft(b.requestExpiresAt ?? b.holdExpiresAt)}
                          </span>
                        </td>
                        {canSeeMoney && (
                          <td className="num">
                            {b.total !== undefined
                              ? formatKES(Number(b.total))
                              : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {canSeeCleaning && (
            <section className="fm__section">
              <h2>Units to clean ({cleaningTasks.length})</h2>
              <div className="ad__tablewrap">
                {cleaningTasks.length === 0 ? (
                  <p className="ad__muted">All units are clean.</p>
                ) : (
                  <table className="ad__table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Next check-in</th>
                        <th>Note</th>
                        <th className="ad__rowactions">
                          <span className="nx-sr">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cleaningTasks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.unit.title || t.unit.number}</strong>
                            <span className="ad__sub">
                              {t.property.name} · {t.unit.number}
                            </span>
                          </td>
                          <td>
                            {t.nextCheckIn ? (
                              <span className="ad__badge ad__badge--warn">
                                {t.nextCheckIn}
                              </span>
                            ) : (
                              <span className="ad__sub">
                                No upcoming check-in
                              </span>
                            )}
                          </td>
                          <td>{t.note ?? '—'}</td>
                          <td className="ad__rowactions">
                            <div>
                              <Link
                                to="/app/cleaning"
                                className="nx-btn"
                              >
                                Open cleaning
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {canSeeMoney && (
            <BookingSection
              title="Balances due"
              count={balancesDue.length}
              items={balancesDue}
              showMoney={canSeeMoney}
            />
          )}
        </>
      )}
    </div>
  );
}

function BookingSection({
  title,
  count,
  items,
  showMoney,
}: {
  title: string;
  count: number;
  items: Booking[];
  showMoney: boolean;
}) {
  return (
    <section className="fm__section">
      <h2>
        {title} ({count})
      </h2>
      <div className="ad__tablewrap">
        {items.length === 0 ? (
          <p className="ad__muted">None right now.</p>
        ) : (
          <table className="ad__table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Guest</th>
                <th>Unit</th>
                <th>Dates</th>
                <th>Status</th>
                {showMoney && <th className="num">Total</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((b) => {
                const badge = bookingStatusBadge(b.status);
                return (
                  <tr key={b.id}>
                    <td>
                      <Link
                        to={`/app/bookings/${b.id}`}
                        className="ad__link code"
                      >
                        {b.code}
                      </Link>
                    </td>
                    <td>{b.guest?.name ?? '—'}</td>
                    <td>
                      <strong>{b.listing.title}</strong>
                      <span className="ad__sub">
                        {b.property.name} · {b.unit.number}
                      </span>
                    </td>
                    <td>
                      {b.checkIn} → {b.checkOut}
                    </td>
                    <td>
                      <span className={badge.className}>{badge.label}</span>
                    </td>
                    {showMoney && (
                      <td className="num">
                        {b.total !== undefined
                          ? formatKES(Number(b.total))
                          : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
