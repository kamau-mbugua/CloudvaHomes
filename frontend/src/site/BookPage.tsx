import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  type PublicListingDetail,
  type PublicQuoteResponse,
  type PublicSiteData,
  publicSiteApi,
} from './api';
import { bookingErrorMessage, bookingSteps, formatMinorKES, payLabel } from './booking';

interface BookPageProps {
  site: PublicSiteData;
}

export function BookPage({ site }: BookPageProps) {
  const { listingId = '' } = useParams<{ listingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') ?? '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') ?? '');
  const [guests, setGuests] = useState(
    Math.max(1, Number(searchParams.get('guests') ?? '1') || 1),
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [quote, setQuote] = useState<PublicQuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      publicSiteApi.getListing(site.slug, listingId),
      checkIn && checkOut
        ? publicSiteApi.quote(site.slug, listingId, { checkIn, checkOut, guests })
        : Promise.resolve(null),
    ])
      .then(([detail, q]) => {
        if (cancelled) return;
        setListing(detail);
        setQuote(q);
        setError(null);
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
  }, [site.slug, listingId, checkIn, checkOut, guests]);

  const hasDates = Boolean(checkIn && checkOut && quote);
  const hasDetails = Boolean(name.trim().length >= 2 && phone.trim().length >= 9);
  const hasVerifiedCode = /^\d{6}$/.test(code.trim());
  const stepInfo = bookingSteps({
    hasDates,
    hasDetails,
    hasVerifiedCode,
    hasReviewed: hasDates && hasDetails && hasVerifiedCode,
    bookingMode: quote?.bookingMode ?? listing?.bookingMode ?? 'INSTANT',
  });

  async function handleSendCode() {
    if (!hasDetails) {
      setError('Enter your name and phone number first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await publicSiteApi.verifyPhone(site.slug, phone.trim());
      setCodeSent(true);
    } catch (err) {
      setError(bookingErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!listing || !quote) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await publicSiteApi.createBooking(site.slug, {
        listingId: listing.id,
        checkIn,
        checkOut,
        guests,
        name: name.trim(),
        phone: phone.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        code: code.trim(),
      });
      const tokenPart = res.link.split('/b/')[1];
      if (tokenPart) {
        navigate(`/b/${tokenPart}`);
      } else {
        window.location.href = res.link;
      }
    } catch (err) {
      setError(bookingErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !listing) {
    return <div className="site-loading">Preparing your booking…</div>;
  }

  return (
    <div className="site-book">
      <Link to={`/u/${listingId}`} className="site-back-link">
        ← Back to {listing?.title ?? 'stay'}
      </Link>

      <h1 className="site-book__title">
        {quote?.bookingMode === 'REQUEST' ? 'Request to book' : 'Complete your booking'}
      </h1>

      <div className="site-steps" aria-label="Booking progress">
        {stepInfo.order.map((s) => (
          <span
            key={s}
            className={`site-step ${stepInfo.next === s ? 'is-active' : ''}`}
          >
            {s}
          </span>
        ))}
      </div>

      {error && (
        <div className="site-alert site-alert--error" role="alert">
          {error}
        </div>
      )}

      <form className="site-book__layout" onSubmit={(e) => void handleConfirmBooking(e)}>
        <div className="site-book__main">
          <section className="site-card-section">
            <h2>1. Stay dates & guests</h2>
            <div className="site-form-row">
              <label className="site-field">
                <span>Check-in</span>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  required
                />
              </label>
              <label className="site-field">
                <span>Check-out</span>
                <input
                  type="date"
                  value={checkOut}
                  min={checkIn || undefined}
                  onChange={(e) => setCheckOut(e.target.value)}
                  required
                />
              </label>
              <label className="site-field">
                <span>Guests</span>
                <input
                  type="number"
                  min={1}
                  max={listing?.maxGuests ?? 10}
                  value={guests}
                  onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
                  required
                />
              </label>
            </div>
          </section>

          <section className="site-card-section">
            <h2>2. Your details</h2>
            <div className="site-form-stack">
              <label className="site-field">
                <span>Full name</span>
                <input
                  type="text"
                  placeholder="Jane Wanjiku"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="site-field">
                <span>Phone number (M-Pesa / SMS)</span>
                <input
                  type="tel"
                  placeholder="0712 345 678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </label>
              <label className="site-field">
                <span>Email (optional)</span>
                <input
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="site-field">
                <span>Note for host (optional)</span>
                <textarea
                  rows={2}
                  placeholder="Arrival time or special requests"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="site-card-section">
            <h2>3. Confirm your phone number</h2>
            <p className="site-muted">
              We send a 6-digit SMS code to verify your phone number and send your booking link.
            </p>
            <div className="site-code-row">
              <button
                type="button"
                className="site-btn site-btn--secondary"
                disabled={!hasDetails || submitting}
                onClick={() => void handleSendCode()}
              >
                {codeSent ? 'Resend SMS code' : 'Send SMS code'}
              </button>
              <label className="site-field site-field--inline">
                <span>6-digit code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </label>
            </div>
          </section>
        </div>

        <aside className="site-book__sidebar">
          <div className="site-quote-card">
            <h3>{listing?.title}</h3>
            {quote ? (
              <>
                <p className="site-muted">
                  {checkIn} → {checkOut} ({quote.nights} nights) · {guests}{' '}
                  {guests === 1 ? 'guest' : 'guests'}
                </p>
                <div className="site-quote-lines">
                  {quote.lines.map((line, i) => (
                    <div key={`${line.kind}-${i}`} className="site-quote-line">
                      <span>{line.label}</span>
                      <span>{formatMinorKES(line.amount)}</span>
                    </div>
                  ))}
                  <div className="site-quote-total">
                    <span>Total</span>
                    <strong>{formatMinorKES(quote.total)}</strong>
                  </div>
                  <div className="site-quote-due">
                    <span>Due now</span>
                    <strong>{formatMinorKES(quote.dueNow)}</strong>
                  </div>
                </div>
                <p className="site-terms-note">{quote.payWhenText}</p>
                <p className="site-terms-note">{quote.cancellationText}</p>
                <button
                  type="submit"
                  className="site-btn site-btn--primary site-btn--full"
                  disabled={!hasDates || !hasDetails || !hasVerifiedCode || submitting}
                >
                  {submitting
                    ? 'Submitting…'
                    : payLabel(
                        quote.dueNow,
                        quote.payWhen ??
                          (BigInt(quote.dueNow) === 0n ? 'ON_ARRIVAL' : 'FULL'),
                        quote.bookingMode,
                      )}
                </button>
              </>
            ) : (
              <p className="site-muted">Select valid check-in and check-out dates to see pricing.</p>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}
