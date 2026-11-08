import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  type PublicListingDetail,
  type PublicQuoteResponse,
  type PublicSiteData,
  publicSiteApi,
  photoSrc,
} from './api';
import { formatMinorKES, payLabel } from './booking';
import { DatePicker } from './DatePicker';

interface UnitPageProps {
  site: PublicSiteData;
}

export function UnitPage({ site }: UnitPageProps) {
  const { listingId = '' } = useParams<{ listingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') ?? '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') ?? '');
  const [guests, setGuests] = useState(
    Math.max(1, Number(searchParams.get('guests') ?? '1') || 1),
  );

  const [quote, setQuote] = useState<PublicQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const [rangeBounds] = useState(() => {
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    const future = new Date(now.getTime() + 180 * 86_400_000).toISOString().slice(0, 10);
    return { from, to: future };
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      publicSiteApi.getListing(site.slug, listingId),
      publicSiteApi.getAvailability(site.slug, listingId, rangeBounds.from, rangeBounds.to),
    ])
      .then(([detail, avail]) => {
        if (cancelled) return;
        setListing(detail);
        setUnavailable(new Set(avail.unavailable));
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load unit');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [site.slug, listingId, rangeBounds.from, rangeBounds.to]);

  useEffect(() => {
    if (!checkIn || !checkOut || !listing) {
      return;
    }
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setQuoting(true);
      setQuoteError(null);
      try {
        const q = await publicSiteApi.quote(site.slug, listing.id, { checkIn, checkOut, guests });
        if (!cancelled) setQuote(q);
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(err instanceof Error ? err.message : 'Unable to price these dates');
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [site.slug, listing, checkIn, checkOut, guests]);

  if (loading) {
    return <div className="site-loading">Loading stay details…</div>;
  }

  if (error || !listing) {
    return (
      <div className="site-empty">
        <p>{error ?? 'Listing not found.'}</p>
        <Link to="/" className="site-btn site-btn--ghost">
          ← Back to all stays
        </Link>
      </div>
    );
  }

  function proceedToBook() {
    if (!checkIn || !checkOut) return;
    const qs = new URLSearchParams({
      checkIn,
      checkOut,
      guests: String(guests),
    });
    navigate(`/u/${listing!.id}/book?${qs.toString()}`);
  }

  return (
    <div className="site-unit">
      <div className="site-unit__top">
        <Link to="/" className="site-back-link">
          ← All stays at {site.businessName}
        </Link>
        <h1 className="site-unit__title">{listing.title}</h1>
        <p className="site-unit__subtitle">
          {listing.area ? `${listing.area} · ` : ''}Up to {listing.maxGuests} guests ·{' '}
          {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}`}{' '}
          · {listing.bathrooms} bath
        </p>
      </div>

      {listing.photoUrls.length > 0 && (
        <div className="site-gallery">
          {listing.photoUrls.map((url, idx) => (
            <img
              key={url}
              src={photoSrc(url, idx === 0 ? 1024 : 480)!}
              alt={`${listing.title} photo ${idx + 1}`}
              loading={idx === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className={idx === 0 ? 'site-gallery__main' : 'site-gallery__thumb'}
            />
          ))}
        </div>
      )}

      <div className="site-unit__layout">
        <div className="site-unit__main">
          {listing.description && (
            <section className="site-unit__block">
              <h2>About this stay</h2>
              <p>{listing.description}</p>
            </section>
          )}

          {listing.amenities.length > 0 && (
            <section className="site-unit__block">
              <h2>Amenities</h2>
              <div className="site-chips">
                {listing.amenities.map((a) => (
                  <span key={a} className="site-chip">
                    {a}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="site-unit__block">
            <h2>Select your dates</h2>
            {listing.minNights > 1 && (
              <p className="site-muted">Minimum stay: {listing.minNights} nights</p>
            )}
            <DatePicker
              checkIn={checkIn}
              checkOut={checkOut}
              unavailable={unavailable}
              minNights={listing.minNights}
              minDateIso={rangeBounds.from}
              onChange={(ci, co) => {
                setCheckIn(ci);
                setCheckOut(co);
                if (!ci || !co) {
                  setQuote(null);
                  setQuoteError(null);
                }
              }}
            />
          </section>

          <section className="site-unit__block">
            <h2>Booking & cancellation terms</h2>
            <p>{listing.payWhenText}</p>
            <p>{listing.cancellationText}</p>
          </section>
        </div>

        <aside className="site-unit__sidebar">
          <div className="site-quote-card">
            <div className="site-quote-card__price">
              <strong>{formatMinorKES(listing.nightlyPrice)}</strong>
              <span> / night</span>
            </div>

            <label className="site-field">
              <span>Guests (max {listing.maxGuests})</span>
              <input
                type="number"
                min={1}
                max={listing.maxGuests}
                value={guests}
                onChange={(e) =>
                  setGuests(
                    Math.min(
                      listing.maxGuests,
                      Math.max(1, Number(e.target.value) || 1),
                    ),
                  )
                }
              />
            </label>

            {quoting && <p className="site-muted">Calculating price…</p>}
            {quoteError && <p className="site-alert site-alert--error">{quoteError}</p>}

            {quote && (
              <div className="site-quote-lines">
                {quote.lines.map((line, i) => (
                  <div key={`${line.kind}-${i}`} className="site-quote-line">
                    <span>{line.label}</span>
                    <span>{formatMinorKES(line.amount)}</span>
                  </div>
                ))}
                <div className="site-quote-total">
                  <span>Total ({quote.nights} nights)</span>
                  <strong>{formatMinorKES(quote.total)}</strong>
                </div>
                <div className="site-quote-due">
                  <span>Due now</span>
                  <strong>{formatMinorKES(quote.dueNow)}</strong>
                </div>
              </div>
            )}
            {quote && !quote.available && quote.problems.length > 0 ? (
              <p className="site-alert site-alert--error" role="alert">
                {quote.problems.join('. ')}.
              </p>
            ) : null}

            <button
              type="button"
              className="site-btn site-btn--primary site-btn--full"
              disabled={!quote || quoting}
              onClick={proceedToBook}
            >
              {quote
                ? payLabel(
                    quote.dueNow,
                    quote.payWhen ?? (BigInt(quote.dueNow) === 0n ? 'ON_ARRIVAL' : 'FULL'),
                    quote.bookingMode,
                  )
                : 'Select dates to book'}
            </button>
          </div>
        </aside>
      </div>

      {/* Sticky mobile bottom bar */}
      <div className="site-sticky-bar">
        <div>
          <div className="site-sticky-bar__price">
            {quote ? formatMinorKES(quote.total) : `${formatMinorKES(listing.nightlyPrice)} / night`}
          </div>
          <div className="site-sticky-bar__sub">
            {quote ? `${quote.nights} nights · Due now ${formatMinorKES(quote.dueNow)}` : 'Pick dates on calendar'}
          </div>
        </div>
        <button
          type="button"
          className="site-btn site-btn--primary"
          disabled={!quote || quoting}
          onClick={proceedToBook}
        >
          {quote ? 'Continue' : 'Select dates'}
        </button>
      </div>
    </div>
  );
}
