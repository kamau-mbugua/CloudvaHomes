import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { PropertySelect } from '../billing/ui';
import { useListFilters } from '../portfolio/hooks';
import { staysErrorMessage, staysKeys } from './api';
import { bookingStatusBadge } from './calendar';
import { BookingSheet } from './BookingSheet';
import type { Booking, BookingStatus, Listing } from './types';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { label: string; value: BookingStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Requested', value: 'REQUESTED' },
  { label: 'Waiting for payment', value: 'HELD' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Checked in', value: 'CHECKED_IN' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export function BookingsPage() {
  const session = useSession();
  const perms = new Set(session?.permissions ?? []);
  const canCreate = perms.has('bookings:create');
  const canViewPayments = perms.has('stay-payments:view');

  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status') as BookingStatus | '';
  const propertyId = filters.get('propertyId') || session?.activePropertyId || '';
  const from = filters.get('from');
  const to = filters.get('to');

  const [bookingSheetOpen, setBookingSheetOpen] = useState(false);

  const bookingsQuery = useQuery({
    queryKey: [
      ...staysKeys.bookings,
      { status, q, propertyId, from, to, page, pageSize: PAGE_SIZE },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      if (propertyId) params.set('propertyId', propertyId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<PageEnvelope<Booking>>(`/host/bookings?${params.toString()}`);
    },
  });

  const listingsQuery = useQuery({
    queryKey: [...staysKeys.listings, { propertyId }],
    enabled: canCreate,
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (propertyId) params.set('propertyId', propertyId);
      const res = await api.get<PageEnvelope<Listing>>(
        `/host/listings?${params.toString()}`,
      );
      return res.data;
    },
  });

  const rows = bookingsQuery.data?.data ?? [];
  const meta = bookingsQuery.data?.meta;
  const filtered = Boolean(q || status || filters.get('propertyId') || from || to);
  const showMoneyColumn = canViewPayments || rows.some((b) => b.total !== undefined);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input
          type="search"
          className="ad__search"
          placeholder="Search guest name, phone or B00001…"
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
        />
        <PropertySelect
          allowAll
          value={propertyId}
          onChange={(v) => filters.setFilter({ propertyId: v })}
        />
        <select
          className="ad__select"
          value={status}
          onChange={(e) => filters.setFilter({ status: e.target.value })}
          aria-label="Status filter"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="py__daterange">
          <span>From</span>
          <input
            type="date"
            className="ad__select"
            value={from}
            onChange={(e) => filters.setFilter({ from: e.target.value })}
          />
        </label>
        <label className="py__daterange">
          <span>To</span>
          <input
            type="date"
            className="ad__select"
            value={to}
            onChange={(e) => filters.setFilter({ to: e.target.value })}
          />
        </label>

        {canCreate && (
          <div className="bl__headbtns pg-push">
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              onClick={() => setBookingSheetOpen(true)}
            >
              New booking
            </button>
          </div>
        )}
      </div>

      {bookingsQuery.isError && (
        <p className="ad__error" role="alert">
          {staysErrorMessage(bookingsQuery.error)}
        </p>
      )}

      {bookingsQuery.isLoading ? (
        <TableSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState
            title="No bookings found"
            detail="Try clearing the filters or create a new booking."
            onClear={filtered ? () => filters.clear() : undefined}
            action={
              canCreate ? (
                <button
                  type="button"
                  className="nx-btn nx-btn--primary"
                  onClick={() => setBookingSheetOpen(true)}
                >
                  New booking
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Guest</th>
                <th>Unit</th>
                <th>Dates</th>
                <th>Status</th>
                {showMoneyColumn && <th className="num">Total / Paid</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
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
                    <td>
                      <strong>{b.guest?.name ?? '—'}</strong>
                      {b.guest?.phone && (
                        <span className="ad__sub">{b.guest.phone}</span>
                      )}
                    </td>
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
                    {showMoneyColumn && (
                      <td className="num">
                        {b.total !== undefined ? (
                          <>
                            <strong>{formatKES(Number(b.total))}</strong>
                            <span className="ad__sub">
                              Paid {formatKES(Number(b.amountPaid ?? '0'))}
                            </span>
                          </>
                        ) : (
                          <span className="ad__sub">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        meta={meta}
        onPage={(next) => filters.setFilter({ page: String(next) })}
      />

      {bookingSheetOpen && (
        <BookingSheet
          listings={listingsQuery.data ?? []}
          onClose={() => setBookingSheetOpen(false)}
        />
      )}
    </div>
  );
}
