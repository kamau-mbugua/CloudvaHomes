import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type PublicBookingDetail, publicSiteApi } from './api';
import {
  amountDueNow,
  bookingErrorMessage,
  digitsOnly,
  formatMinorKES,
  guestStatusLabel,
  holdTimeLeft,
  howToPayLine,
} from './booking';

export function BookingPage() {
  const { token = '' } = useParams<{ token: string }>();

  const [booking, setBooking] = useState<PublicBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stkPhone, setStkPhone] = useState('');
  const [stkPending, setStkPending] = useState(false);
  const [paying, setPaying] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelCodeSent, setCancelCodeSent] = useState(false);
  const [cancelCode, setCancelCode] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [refundResult, setRefundResult] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    publicSiteApi
      .getBooking(token)
      .then((b) => {
        if (!cancelled) setBooking(b);
      })
      .catch((err) => {
        if (!cancelled) setError(bookingErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Poll every 5 s while HELD or while an STK prompt is pending
  useEffect(() => {
    if (!booking) return;
    if (booking.status !== 'HELD' && !stkPending) return;
    const timer = window.setInterval(() => {
      publicSiteApi
        .getBooking(token)
        .then((b) => {
          setBooking(b);
          if (b.status !== 'HELD' && BigInt(b.owed) === 0n) {
            setStkPending(false);
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [booking, stkPending, token]);

  // Update hold countdown every second while HELD
  useEffect(() => {
    if (booking?.status !== 'HELD' || !booking.holdExpiresAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [booking?.status, booking?.holdExpiresAt]);

  async function handlePayNow() {
    setPaying(true);
    setError(null);
    try {
      await publicSiteApi.payBooking(token, stkPhone.trim() || undefined);
      setStkPending(true);
    } catch (err) {
      setError(bookingErrorMessage(err));
    } finally {
      setPaying(false);
    }
  }

  async function handleRequestCancelCode() {
    setCancelling(true);
    setError(null);
    try {
      await publicSiteApi.requestCancelCode(token);
      setCancelCodeSent(true);
    } catch (err) {
      setError(bookingErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  async function handleConfirmCancel(e: React.FormEvent) {
    e.preventDefault();
    setCancelling(true);
    setError(null);
    try {
      const res = await publicSiteApi.cancelBooking(token, cancelCode.trim());
      setRefundResult(res.refund);
      const updated = await publicSiteApi.getBooking(token);
      setBooking(updated);
      setShowCancel(false);
    } catch (err) {
      setError(bookingErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return <div className="site-loading">Loading booking…</div>;
  }

  if (!booking) {
    return (
      <div className="site-empty">
        <p>{error ?? 'Booking not found.'}</p>
        <Link to="/" className="site-btn site-btn--ghost">
          ← Back to home
        </Link>
      </div>
    );
  }

  const holdRemainingSec = booking.holdExpiresAt
    ? Math.max(0, Math.floor((new Date(booking.holdExpiresAt).getTime() - nowMs) / 1000))
    : 0;
  const owedBig = BigInt(booking.owed || '0');
  const dueNowAmount = amountDueNow(booking);
  const payLine = howToPayLine(booking);
  const canCancel = ['REQUESTED', 'HELD', 'CONFIRMED'].includes(booking.status);
  const waDigits = digitsOnly(booking.contact.whatsappPhone);

  return (
    <div className="site-booking-page">
      <div className="site-booking-header">
        <div>
          <span className="site-booking-code">Booking {booking.code}</span>
          <h1 className="site-booking-title">{booking.listing.title}</h1>
          <p className="site-muted">
            {booking.dates.checkIn} → {booking.dates.checkOut} ({booking.dates.nights} nights) ·{' '}
            {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}
          </p>
        </div>
        <span className={`site-status-pill site-status-pill--${booking.status.toLowerCase()}`}>
          {guestStatusLabel(booking.status)}
        </span>
      </div>

      {error && (
        <div className="site-alert site-alert--error" role="alert">
          {error}
        </div>
      )}

      {refundResult !== null && (
        <div className="site-alert site-alert--info">
          Booking cancelled. Policy refund due: {formatMinorKES(refundResult)}.
        </div>
      )}

      {booking.status === 'HELD' && (
        <div className="site-hold-banner">
          <strong>Hold active:</strong> Complete payment of {formatMinorKES(dueNowAmount.toString())} within{' '}
          <span className="site-countdown">
            {holdTimeLeft(holdRemainingSec)}
          </span>{' '}
          to confirm your dates.
        </div>
      )}

      {booking.status === 'REQUESTED' && (
        <div className="site-hold-banner">
          <strong>Request sent:</strong> Waiting for {booking.contact.businessName} to review and
          confirm your stay.
        </div>
      )}

      <div className="site-book__layout">
        <div className="site-book__main">
          {owedBig > 0n && ['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status) && (
            <section className="site-card-section">
              <h2>Payment</h2>
              <p>
                Amount due now:{' '}
                <strong>
                  {formatMinorKES(dueNowAmount.toString())}
                </strong>
              </p>

              {booking.canPayInApp && (
                <div className="site-mpesa-box">
                  <label className="site-field">
                    <span>M-Pesa phone number (leave blank to use booking phone)</span>
                    <input
                      type="tel"
                      placeholder="0712 345 678"
                      value={stkPhone}
                      onChange={(e) => setStkPhone(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="site-btn site-btn--primary"
                    disabled={paying}
                    onClick={() => void handlePayNow()}
                  >
                    {paying ? 'Sending prompt…' : 'Send M-Pesa prompt'}
                  </button>
                  {stkPending && (
                    <p className="site-muted">
                      Check your phone for the M-Pesa PIN prompt. This page updates automatically.
                    </p>
                  )}
                </div>
              )}

              {payLine ? <p className="site-muted">{payLine}</p> : null}

              {booking.paybill && (
                <div className="site-paybill-box">
                  <h3>Pay via M-Pesa Paybill / Till</h3>
                  <p>
                    Business / Paybill number: <strong>{booking.paybill.number}</strong>
                  </p>
                  <p>
                    Account reference: <strong>{booking.paybill.accountRef}</strong>
                  </p>
                </div>
              )}
            </section>
          )}

          {(booking.address || booking.checkInInstructions || booking.mapUrl) && (
            <section className="site-card-section">
              <h2>Arrival & check-in details</h2>
              {booking.address && (
                <p>
                  <strong>Location:</strong> {booking.address}
                </p>
              )}
              {booking.mapUrl && (
                <p>
                  <a href={booking.mapUrl} target="_blank" rel="noreferrer">
                    Open in Google Maps for directions
                  </a>
                </p>
              )}
              {booking.checkInInstructions && (
                <p>
                  <strong>Instructions:</strong> {booking.checkInInstructions}
                </p>
              )}
              <p className="site-muted">
                Check-in from {booking.contact.checkInTime} · Check-out by{' '}
                {booking.contact.checkOutTime}
              </p>
            </section>
          )}

          <section className="site-card-section">
            <h2>Host contact</h2>
            <p>
              <strong>{booking.contact.businessName}</strong>
            </p>
            <div className="site-contact-actions">
              {waDigits && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="site-btn site-btn--secondary"
                >
                  WhatsApp host
                </a>
              )}
              {booking.contact.phone && (
                <a href={`tel:${booking.contact.phone}`} className="site-btn site-btn--ghost">
                  Call {booking.contact.phone}
                </a>
              )}
            </div>
          </section>

          {canCancel && (
            <section className="site-card-section">
              <h2>Cancel booking</h2>
              <p className="site-terms-note">{booking.cancellationText}</p>
              <p className="site-muted">
                Amount paid so far: {formatMinorKES(booking.amountPaid)}
              </p>

              {!showCancel ? (
                <button
                  type="button"
                  className="site-btn site-btn--danger"
                  onClick={() => setShowCancel(true)}
                >
                  Cancel booking
                </button>
              ) : (
                <form className="site-cancel-box" onSubmit={(e) => void handleConfirmCancel(e)}>
                  <p>
                    Verify with a 6-digit SMS code sent to the phone number used for this booking.
                  </p>
                  <div className="site-code-row">
                    <button
                      type="button"
                      className="site-btn site-btn--secondary"
                      disabled={cancelling}
                      onClick={() => void handleRequestCancelCode()}
                    >
                      {cancelCodeSent ? 'Resend code' : 'Send verification code'}
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit code"
                      value={cancelCode}
                      onChange={(e) => setCancelCode(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>
                  <div className="site-contact-actions">
                    <button
                      type="submit"
                      className="site-btn site-btn--danger"
                      disabled={!/^\d{6}$/.test(cancelCode) || cancelling}
                    >
                      {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
                    </button>
                    <button
                      type="button"
                      className="site-btn site-btn--ghost"
                      onClick={() => setShowCancel(false)}
                    >
                      Keep booking
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>

        <aside className="site-book__sidebar">
          <div className="site-quote-card">
            <h3>Price breakdown</h3>
            <div className="site-quote-lines">
              {booking.lines.map((line, i) => (
                <div key={`${line.kind}-${i}`} className="site-quote-line">
                  <span>{line.label}</span>
                  <span>{formatMinorKES(line.amount)}</span>
                </div>
              ))}
              <div className="site-quote-total">
                <span>Total</span>
                <strong>{formatMinorKES(booking.total)}</strong>
              </div>
              <div className="site-quote-line">
                <span>Paid</span>
                <span>{formatMinorKES(booking.amountPaid)}</span>
              </div>
              {BigInt(booking.amountRefunded || '0') > 0n && (
                <div className="site-quote-line">
                  <span>Refunded</span>
                  <span>{formatMinorKES(booking.amountRefunded)}</span>
                </div>
              )}
              <div className="site-quote-due">
                <span>Balance owed</span>
                <strong>{formatMinorKES(booking.owed)}</strong>
              </div>
            </div>
            <p className="site-terms-note">{booking.payWhenText}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
