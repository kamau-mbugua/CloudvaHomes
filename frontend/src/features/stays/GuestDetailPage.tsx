import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CardSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import { bookingStatusBadge } from './calendar';
import type { BookingStatus } from './types';
import { formatGuestIdDisplay, type HostGuestDetail } from './ops';

export function GuestDetailPage() {
  const { guestId = '' } = useParams<{ guestId: string }>();
  const queryClient = useQueryClient();
  const session = useSession();
  const canUpdate = new Set(session?.permissions ?? []).has('guests:update');

  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [doNotAccept, setDoNotAccept] = useState(false);
  const [newIdNumber, setNewIdNumber] = useState('');

  const guestQuery = useQuery({
    queryKey: [...staysKeys.guests, guestId],
    enabled: Boolean(guestId),
    queryFn: async () => {
      const res = await api.get<DataEnvelope<HostGuestDetail>>(
        `/host/guests/${guestId}`,
      );
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      notes?: string | null;
      doNotAccept?: boolean;
      idNumber?: string;
    }) => {
      const res = await api.patch<DataEnvelope<HostGuestDetail>>(
        `/host/guests/${guestId}`,
        payload,
      );
      return res.data;
    },
    onSuccess: async () => {
      setEditing(false);
      setNewIdNumber('');
      await queryClient.invalidateQueries({ queryKey: staysKeys.guests });
    },
  });

  const guest = guestQuery.data;

  const startEdit = (g: HostGuestDetail) => {
    setNotes(g.notes ?? '');
    setDoNotAccept(g.doNotAccept);
    setNewIdNumber('');
    setEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: {
      notes?: string | null;
      doNotAccept?: boolean;
      idNumber?: string;
    } = {
      notes: notes.trim() || null,
      doNotAccept,
    };
    if (newIdNumber.trim()) {
      payload.idNumber = newIdNumber.trim();
    }
    updateMutation.mutate(payload);
  };

  if (guestQuery.isLoading) {
    return <CardSkeleton count={3} label="Loading guest…" />;
  }

  if (guestQuery.isError || !guest) {
    return (
      <div className="pg">
        <p className="ad__error" role="alert">
          {staysErrorMessage(guestQuery.error)}
        </p>
      </div>
    );
  }

  const showStayPaidColumn =
    guest.totalPaid !== undefined ||
    guest.stays.some((s) => s.amountPaid !== undefined);

  return (
    <div className="pg pf__page">
      <Breadcrumbs
        trail={[
          { label: 'Guests', to: '/app/guests' },
          { label: guest.name },
        ]}
      />

      <div className="pf__head">
        <div>
          <h1>
            {guest.name}{' '}
            <span
              className={
                guest.doNotAccept
                  ? 'ad__badge ad__badge--bad'
                  : 'ad__badge ad__badge--ok'
              }
            >
              {guest.doNotAccept ? 'Do not accept instant' : 'Good standing'}
            </span>
          </h1>
          <p>
            {guest.phone}
            {guest.email ? ` · ${guest.email}` : ''}
          </p>
        </div>

        {canUpdate && (
          <div className="sl__headactions">
            <button
              type="button"
              className="nx-btn"
              onClick={() => startEdit(guest)}
            >
              Edit guest
            </button>
          </div>
        )}
      </div>

      <div className="ad__stats pf__stats bl__stats">
        <div className="ad__stat">
          <span className="ad__stat__label">Total stays</span>
          <span className="ad__stat__value num">{guest.staysCount}</span>
        </div>
        {guest.totalPaid !== undefined && (
          <div className="ad__stat">
            <span className="ad__stat__label">Total paid</span>
            <span className="ad__stat__value num">
              {formatKES(Number(guest.totalPaid))}
            </span>
          </div>
        )}
        <div className="ad__stat">
          <span className="ad__stat__label">ID / Passport (masked)</span>
          <span
            className="ad__stat__value code"
            data-testid="guest-id-hint"
          >
            {formatGuestIdDisplay(guest)}
          </span>
        </div>
      </div>

      <section className="fm__section">
        <h2>Guest details</h2>
        <dl className="pf__facts">
          <Fact label="Name">{guest.name}</Fact>
          <Fact label="Phone">{guest.phone}</Fact>
          <Fact label="Email">{guest.email ?? '—'}</Fact>
          <Fact label="Booking policy override">
            {guest.doNotAccept
              ? 'Requires manual review (no instant booking)'
              : 'Normal'}
          </Fact>
          <Fact label="Notes">{guest.notes ?? '—'}</Fact>
        </dl>
      </section>

      <section className="fm__section">
        <h2>Stays history</h2>
        <div className="ad__tablewrap">
          {guest.stays.length === 0 ? (
            <p className="ad__muted">No stays recorded yet.</p>
          ) : (
            <table className="ad__table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Listing</th>
                  <th>Dates</th>
                  <th>Status</th>
                  {showStayPaidColumn && <th className="num">Paid</th>}
                </tr>
              </thead>
              <tbody>
                {guest.stays.map((s) => {
                  const badge = bookingStatusBadge(s.status as BookingStatus);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link
                          to={`/app/bookings/${s.id}`}
                          className="ad__link code"
                        >
                          {s.code}
                        </Link>
                      </td>
                      <td>
                        <strong>{s.listing.title}</strong>
                        <span className="ad__sub">
                          {s.property.name} · {s.unit.number}
                        </span>
                      </td>
                      <td>
                        {s.checkIn} → {s.checkOut}
                      </td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      {showStayPaidColumn && (
                        <td className="num">
                          {s.amountPaid === undefined
                            ? '—'
                            : formatKES(Number(s.amountPaid))}
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

      {editing && (
        <Sheet
          title="Edit guest"
          busy={updateMutation.isPending}
          onClose={() => setEditing(false)}
          footer={
            <>
              <button
                type="button"
                className="nx-btn"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="guest-edit-form"
                className="nx-btn nx-btn--primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </>
          }
        >
          <form
            id="guest-edit-form"
            className="pf__dialogform"
            onSubmit={handleSave}
            noValidate
          >
            <p className="ad__muted">{guest.name}</p>

            {updateMutation.isError && (
              <p className="nx-sheet__error" role="alert">
                {staysErrorMessage(updateMutation.error)}
              </p>
            )}

            <div className="fm__grid">
              <Field id="guest-notes" label="Host notes" optional wide>
                <textarea
                  id="guest-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="nx-input"
                  placeholder="Private notes about this guest…"
                />
              </Field>

              <Field
                id="guest-id-input"
                label="Update ID / Passport number"
                hint="Leave blank to keep current"
                optional
                wide
              >
                <input
                  id="guest-id-input"
                  type="text"
                  value={newIdNumber}
                  onChange={(e) => setNewIdNumber(e.target.value)}
                  className="nx-input"
                  placeholder={
                    guest.idNumberHint ?? 'Enter ID or passport number'
                  }
                />
              </Field>
            </div>

            <label className="st__check">
              <input
                type="checkbox"
                checked={doNotAccept}
                onChange={(e) => setDoNotAccept(e.target.checked)}
              />
              <span>
                Require host review on new bookings (do not accept instant
                booking)
              </span>
            </label>
          </form>
        </Sheet>
      )}
    </div>
  );
}
