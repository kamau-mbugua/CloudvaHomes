import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import { addDays, todayIso } from './calendar';
import { toMinorString } from './money';
import type { Booking, BookingQuoteResponse, Listing } from './types';

interface Props {
  listings: Listing[];
  initialListingId?: string;
  initialCheckIn?: string;
  onClose: () => void;
  onCreated?: (booking: Booking) => void;
}

export function BookingSheet({
  listings,
  initialListingId,
  initialCheckIn,
  onClose,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const defaultCheckIn = initialCheckIn ?? todayIso();
  const [listingId, setListingId] = useState<string>(
    initialListingId ?? listings[0]?.id ?? '',
  );
  const [checkIn, setCheckIn] = useState<string>(defaultCheckIn);
  const [checkOut, setCheckOut] = useState<string>(addDays(defaultCheckIn, 2));
  const [guests, setGuests] = useState<number>(2);
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [totalOverrideKes, setTotalOverrideKes] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [confirmNow, setConfirmNow] = useState<boolean>(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const canQuote = Boolean(
    listingId && checkIn && checkOut && checkOut > checkIn && guests >= 1,
  );
  const quoteQuery = useQuery({
    queryKey: [
      ...staysKeys.bookings,
      'quote',
      { listingId, checkIn, checkOut, guests },
    ],
    enabled: canQuote,
    queryFn: async () => {
      const res = await api.post<DataEnvelope<BookingQuoteResponse>>(
        '/host/bookings/quote',
        {
          listingId,
          checkIn,
          checkOut,
          guests,
        },
      );
      return res.data;
    },
    retry: false,
  });

  const quote = canQuote ? (quoteQuery.data?.quote ?? null) : null;
  const quoteError =
    canQuote && quoteQuery.isError
      ? staysErrorMessage(quoteQuery.error)
      : null;

  const createMutation = useMutation({
    mutationFn: async () => {
      let totalMinor: string | undefined;
      if (totalOverrideKes.trim()) {
        const parsed = toMinorString(totalOverrideKes);
        if (!parsed) {
          throw new Error('Total override must be in whole shillings.');
        }
        totalMinor = parsed;
      }

      const res = await api.post<DataEnvelope<Booking>>('/host/bookings', {
        listingId,
        checkIn,
        checkOut,
        guests,
        guest: {
          name: guestName.trim(),
          phone: guestPhone.trim(),
          ...(guestEmail.trim() ? { email: guestEmail.trim() } : {}),
        },
        ...(totalMinor ? { total: totalMinor } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        confirm: confirmNow,
      });
      return res.data;
    },
    onSuccess: async (booking) => {
      toast.saved(`Booking ${booking.code} created.`);
      await queryClient.invalidateQueries({ queryKey: staysKeys.bookings });
      await queryClient.invalidateQueries({ queryKey: staysKeys.calendar });
      onCreated?.(booking);
      onClose();
    },
    onError: (err) => {
      setLocalError(staysErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!listingId) {
      setLocalError('Select a listing.');
      return;
    }
    if (!guestName.trim() || !guestPhone.trim()) {
      setLocalError('Guest name and phone are required.');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Sheet
      title="New booking"
      busy={createMutation.isPending}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="nx-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="booking-sheet-form"
            className="nx-btn nx-btn--primary"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving…' : 'Create booking'}
          </button>
        </>
      }
    >
      <form
        id="booking-sheet-form"
        className="pf__dialogform"
        onSubmit={handleSubmit}
        noValidate
      >
        <p className="ad__muted">
          Create a phone, WhatsApp, or walk-in booking.
        </p>

        {localError && (
          <p className="nx-sheet__error" role="alert">
            {localError}
          </p>
        )}

        <div className="fm__grid">
          <Field id="booking-listing" label="Listing" wide>
            <select
              id="booking-listing"
              className="nx-input"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} ({l.property.name} · {l.unit.number})
                </option>
              ))}
            </select>
          </Field>

          <Field id="booking-check-in" label="Check-in">
            <input
              id="booking-check-in"
              type="date"
              className="nx-input"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </Field>

          <Field id="booking-check-out" label="Check-out">
            <input
              id="booking-check-out"
              type="date"
              className="nx-input"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </Field>

          <Field id="booking-guests" label="Guests">
            <input
              id="booking-guests"
              type="number"
              min={1}
              max={50}
              className="nx-input"
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
            />
          </Field>

          <Field
            id="booking-total-override"
            label="Agreed total (KES)"
            optional
          >
            <input
              id="booking-total-override"
              type="text"
              inputMode="numeric"
              placeholder={
                quote
                  ? `Calculated: ${formatKES(Number(quote.total))}`
                  : 'Use calculated total'
              }
              className="nx-input"
              value={totalOverrideKes}
              onChange={(e) => setTotalOverrideKes(e.target.value)}
            />
          </Field>

          <Field id="booking-guest-name" label="Guest full name" wide>
            <input
              id="booking-guest-name"
              type="text"
              className="nx-input"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
            />
          </Field>

          <Field id="booking-guest-phone" label="Guest phone">
            <input
              id="booking-guest-phone"
              type="tel"
              placeholder="+2547..."
              className="nx-input"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              required
            />
          </Field>

          <Field id="booking-guest-email" label="Guest email" optional>
            <input
              id="booking-guest-email"
              type="email"
              className="nx-input"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
          </Field>

          <Field id="booking-note" label="Host note" optional wide>
            <textarea
              id="booking-note"
              rows={2}
              className="nx-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        {quoteError && (
          <p className="nx-sheet__error" role="alert">
            {quoteError}
          </p>
        )}

        {quote && (
          <div className="st__quote">
            {quote.lines.map((line, idx) => (
              <div key={idx} className="st__quote__row">
                <span>{line.label}</span>
                <span className="num">{formatKES(Number(line.amount))}</span>
              </div>
            ))}
            <div className="st__quote__total">
              <strong>Quoted total ({quote.nights} nights)</strong>
              <strong className="num">{formatKES(Number(quote.total))}</strong>
            </div>
          </div>
        )}

        <label className="st__check">
          <input
            type="checkbox"
            checked={confirmNow}
            onChange={(e) => setConfirmNow(e.target.checked)}
          />
          <span>Confirm immediately (uncheck to hold awaiting payment)</span>
        </label>
      </form>
    </Sheet>
  );
}
