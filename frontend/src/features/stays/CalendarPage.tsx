import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { PropertySelect } from '../billing/ui';
import { staysErrorMessage, staysKeys } from './api';
import { BlockSheet } from './BlockSheet';
import { BookingSheet } from './BookingSheet';
import { addDays, barFor, bookingStatusBadge, dayColumns, todayIso } from './calendar';
import type { CalendarItem, CalendarResponse, CalendarUnit, Listing } from './types';

const WINDOW_DAYS = 14;

export function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const session = useSession();
  const perms = new Set(session?.permissions ?? []);
  const canCreate = perms.has('bookings:create');
  const canUpdate = perms.has('bookings:update');

  const [propertyId, setPropertyId] = useState(
    session?.activePropertyId ?? '',
  );
  const [from, setFrom] = useState<string>(() => todayIso());
  const [cellChoice, setCellChoice] = useState<{
    unit: CalendarUnit;
    date: string;
    sheet?: 'booking' | 'block';
  } | null>(null);

  const to = addDays(from, WINDOW_DAYS);
  const cols = dayColumns(from, WINDOW_DAYS);

  const calQuery = useQuery({
    queryKey: [
      ...staysKeys.calendar,
      { from, to, propertyId: propertyId || undefined },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (propertyId) params.set('propertyId', propertyId);
      const res = await api.get<DataEnvelope<CalendarResponse>>(
        `/host/bookings/calendar?${params.toString()}`,
      );
      return res.data;
    },
  });

  const listingsQuery = useQuery({
    queryKey: [...staysKeys.listings, { propertyId: propertyId || undefined }],
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

  const unblockMutation = useMutation({
    mutationFn: (blockId: string) => api.delete(`/host/blocks/${blockId}`),
    onSuccess: async () => {
      toast.saved('Dates unblocked.');
      await queryClient.invalidateQueries({ queryKey: staysKeys.calendar });
    },
  });

  const units = calQuery.data?.units ?? [];
  const items = calQuery.data?.items ?? [];

  const handleBarClick = (item: CalendarItem) => {
    if (item.kind === 'BLOCK') {
      if (canUpdate && window.confirm('Unblock these dates?')) {
        unblockMutation.mutate(item.id);
      }
      return;
    }
    navigate(`/app/bookings/${item.id}`);
  };

  return (
    <div className="pg">
      <div className="ad__filters">
        <PropertySelect
          allowAll
          value={propertyId}
          onChange={(v) => setPropertyId(v)}
        />
        <span className="ad__sub num">
          {from} → {to}
        </span>

        <div className="bl__headbtns pg-push">
          <button
            type="button"
            className="nx-btn"
            onClick={() => setFrom((cur) => addDays(cur, -WINDOW_DAYS))}
          >
            ← Prev 14d
          </button>
          <button
            type="button"
            className="nx-btn"
            onClick={() => setFrom(todayIso())}
          >
            Today
          </button>
          <button
            type="button"
            className="nx-btn"
            onClick={() => setFrom((cur) => addDays(cur, WINDOW_DAYS))}
          >
            Next 14d →
          </button>
        </div>
      </div>

      {calQuery.isError && (
        <p className="ad__error" role="alert">
          {staysErrorMessage(calQuery.error)}
        </p>
      )}

      {calQuery.isLoading ? (
        <TableSkeleton rows={6} />
      ) : units.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState
            title="No units on the calendar yet"
            detail="Add a short-stay listing first to see your units on the availability calendar."
          />
        </div>
      ) : (
        <div className="st__cal">
          <div className="st__cal__grid">
            <div
              className="st__cal__head"
              style={{
                gridTemplateColumns: `200px repeat(${WINDOW_DAYS}, minmax(0, 1fr))`,
              }}
            >
              <div className="st__cal__unithead">Unit</div>
              {cols.map((d) => (
                <div key={d} className="st__cal__dayhead num">
                  {d.slice(5)}
                </div>
              ))}
            </div>

            {units.map((u) => {
              const unitItems = items.filter((it) => it.unitId === u.unitId);
              return (
                <div
                  key={u.unitId}
                  className="st__cal__row"
                  style={{
                    gridTemplateColumns: `200px repeat(${WINDOW_DAYS}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="st__cal__unit">
                    <strong>{u.title}</strong>
                    <span className="ad__sub">
                      {u.property.name} · {u.unitNumber}
                    </span>
                  </div>

                  {cols.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!canCreate && !canUpdate}
                      onClick={() => setCellChoice({ unit: u, date: d })}
                      className="st__cal__cell"
                      title={`Book or block ${u.title} starting ${d}`}
                    />
                  ))}

                  <div
                    className="st__cal__bars"
                    style={{
                      gridTemplateColumns: `repeat(${WINDOW_DAYS}, minmax(0, 1fr))`,
                    }}
                  >
                    {unitItems.map((item) => {
                      const bar = barFor(item, from, WINDOW_DAYS);
                      if (!bar) return null;
                      const badge = bookingStatusBadge(item.status);
                      const isBlock = item.kind === 'BLOCK';
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleBarClick(item)}
                          style={{
                            gridColumnStart: bar.start + 1,
                            gridColumnEnd: `span ${bar.span}`,
                          }}
                          className={`st__cal__bar ${
                            isBlock ? 'st__cal__bar--block' : badge.barClassName
                          }`}
                        >
                          {isBlock
                            ? `Blocked${item.hostNote ? `: ${item.hostNote}` : ''}`
                            : `${item.guestName ?? item.code} (${item.code})`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cellChoice && !cellChoice.sheet && (
        <Sheet
          title={cellChoice.unit.title}
          onClose={() => setCellChoice(null)}
          footer={
            <button
              type="button"
              className="nx-btn"
              onClick={() => setCellChoice(null)}
            >
              Close
            </button>
          }
        >
          <div className="pf__dialogform">
            <p className="ad__muted">Selected date: {cellChoice.date}</p>
            <div className="st__cellactions">
              {canCreate && (
                <button
                  type="button"
                  className="nx-btn nx-btn--primary"
                  onClick={() =>
                    setCellChoice({ ...cellChoice, sheet: 'booking' })
                  }
                >
                  New booking starting {cellChoice.date}
                </button>
              )}
              {canUpdate && (
                <button
                  type="button"
                  className="nx-btn"
                  onClick={() =>
                    setCellChoice({ ...cellChoice, sheet: 'block' })
                  }
                >
                  Block dates starting {cellChoice.date}
                </button>
              )}
            </div>
          </div>
        </Sheet>
      )}

      {cellChoice?.sheet === 'booking' && (
        <BookingSheet
          listings={listingsQuery.data ?? []}
          initialListingId={cellChoice.unit.listingId}
          initialCheckIn={cellChoice.date}
          onClose={() => setCellChoice(null)}
        />
      )}

      {cellChoice?.sheet === 'block' && (
        <BlockSheet
          units={units}
          initialUnitId={cellChoice.unit.unitId}
          initialFrom={cellChoice.date}
          onClose={() => setCellChoice(null)}
        />
      )}
    </div>
  );
}
