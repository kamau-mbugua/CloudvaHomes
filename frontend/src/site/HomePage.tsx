import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type PublicListingSummary, type PublicSiteData, photoSrc, publicSiteApi } from './api';
import { digitsOnly, formatMinorKES } from './booking';
import {
  EMPTY_FILTERS,
  type ListingFilters,
  activeFilterCount,
  areasOf,
  filterListings,
  priceStepsOf,
  whatsappLink,
} from './listingFilters';
import { WhatsAppIcon } from './WhatsAppIcon';

interface HomePageProps {
  site: PublicSiteData;
}

export function HomePage({ site }: HomePageProps) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [available, setAvailable] = useState<PublicListingSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_FILTERS);

  const waDigits = digitsOnly(site.whatsappPhone);
  const hasListings = site.listings.length > 0;
  const areas = useMemo(() => areasOf(site.listings), [site.listings]);
  const priceSteps = useMemo(() => priceStepsOf(site.listings), [site.listings]);
  const listings = filterListings(available ?? site.listings, filters);
  const filterCount = activeFilterCount(filters);
  const contactHref = waDigits
    ? `https://wa.me/${waDigits}`
    : site.contactPhone
      ? `tel:${site.contactPhone}`
      : null;
  const datesQuery =
    checkIn && checkOut
      ? `?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&guests=${guests}`
      : '';
  const setFilter = (patch: Partial<ListingFilters>) => setFilters((f) => ({ ...f, ...patch }));

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut) {
      setAvailable(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await publicSiteApi.getAvailable(site.slug, checkIn, checkOut, guests);
      setAvailable(res.listings);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Unable to check availability');
    } finally {
      setSearching(false);
    }
  }

  function clearDates() {
    setCheckIn('');
    setCheckOut('');
    setAvailable(null);
    setSearchError(null);
  }

  return (
    <div className="site-home">
      <section className="site-hero">
        <div className="site-hero__inner">
          <p className="site-hero__eyebrow">Direct booking · Best rates</p>
          <h1 className="site-hero__title">{site.businessName}</h1>
          {site.about && <p className="site-hero__about">{site.about}</p>}
          <div className="site-hero__meta">
            <span>Check-in from {site.checkInTime}</span>
            <span>·</span>
            <span>Check-out by {site.checkOutTime}</span>
          </div>
        </div>

        {hasListings ? (
          <form className="site-search-bar" onSubmit={(e) => void handleSearch(e)}>
            <label className="site-search-field">
              <span>Check-in</span>
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </label>
            <label className="site-search-field">
              <span>Check-out</span>
              <input
                type="date"
                value={checkOut}
                min={checkIn || undefined}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </label>
            <label className="site-search-field">
              <span>Guests</span>
              <input
                type="number"
                min={1}
                max={20}
                value={guests}
                onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <div className="site-search-actions">
              <button type="submit" className="site-btn site-btn--primary" disabled={searching}>
                {searching ? 'Checking…' : 'Check availability'}
              </button>
              {available !== null && (
                <button type="button" className="site-btn site-btn--ghost" onClick={clearDates}>
                  Any dates
                </button>
              )}
            </div>
          </form>
        ) : null}
        {searchError && <p className="site-alert site-alert--error">{searchError}</p>}
      </section>

      <section className="site-section" id="stays">
        <div className="site-section__head">
          <h2>{available !== null ? 'Available for your dates' : 'Our stays'}</h2>
          {hasListings ? (
            <span>
              {listings.length} {listings.length === 1 ? 'place' : 'places'}
            </span>
          ) : null}
        </div>

        {site.listings.length > 1 ? (
          <div className="site-filters" role="search" aria-label="Filter stays">
            <input
              className="site-filters__search"
              type="search"
              placeholder="Search by name or area"
              aria-label="Search stays"
              value={filters.q}
              onChange={(e) => setFilter({ q: e.target.value })}
            />
            {areas.length > 1 ? (
              <select aria-label="Area" value={filters.area} onChange={(e) => setFilter({ area: e.target.value })}>
                <option value="">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              aria-label="Guests"
              value={filters.guests}
              onChange={(e) => setFilter({ guests: Number(e.target.value) })}
            >
              <option value={0}>Any guests</option>
              {[2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}+ guests
                </option>
              ))}
            </select>
            <select
              aria-label="Bedrooms"
              value={filters.bedrooms ?? ''}
              onChange={(e) => setFilter({ bedrooms: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">Any bedrooms</option>
              <option value={0}>Studio</option>
              <option value={1}>1 bedroom</option>
              <option value={2}>2 bedrooms</option>
              <option value={3}>3+ bedrooms</option>
            </select>
            <select
              aria-label="Price per night"
              value={filters.maxPrice ?? ''}
              onChange={(e) => setFilter({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">Any price</option>
              {priceSteps.map((p) => (
                <option key={p} value={p}>
                  Up to {formatMinorKES(p * 100)}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort"
              value={filters.sort}
              onChange={(e) => setFilter({ sort: e.target.value as ListingFilters['sort'] })}
            >
              <option value="recommended">Recommended</option>
              <option value="price-asc">Lowest price</option>
              <option value="price-desc">Highest price</option>
            </select>
            {filterCount > 0 ? (
              <button type="button" className="site-btn site-btn--ghost site-btn--sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear ({filterCount})
              </button>
            ) : null}
          </div>
        ) : null}

        {!hasListings ? (
          <div className="site-empty site-empty--welcome">
            <div className="site-not-found__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
                <path d="M10 20v-5h4v5" />
              </svg>
            </div>
            <h3>No stays listed yet</h3>
            <p>{site.businessName} is getting ready. Check back soon, or ask the host about availability.</p>
            {contactHref ? (
              <a
                href={contactHref}
                target={waDigits ? '_blank' : undefined}
                rel="noreferrer"
                className="site-btn site-btn--primary"
              >
                {waDigits ? 'Message on WhatsApp' : 'Call the host'}
              </a>
            ) : null}
          </div>
        ) : listings.length === 0 ? (
          <div className="site-empty">
            <p>
              {available !== null && filterCount === 0
                ? 'No stays are free for those dates. Try other dates, or see everything we offer.'
                : 'No stays match these filters.'}
            </p>
            <button
              type="button"
              className="site-btn site-btn--ghost"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                clearDates();
              }}
            >
              Show all stays
            </button>
          </div>
        ) : (
          <div className="site-grid">
            {listings.map((item) => {
              const chat = whatsappLink(
                waDigits,
                `Hi ${site.businessName}, I'm interested in "${item.title}"${
                  checkIn && checkOut ? ` from ${checkIn} to ${checkOut}` : ''
                }. Is it available?`,
              );
              return (
                <article key={item.id} className="site-card">
                  <Link to={`/u/${item.id}${datesQuery}`} className="site-card__link">
                    <div className="site-card__media">
                      {item.coverUrl ? (
                        <img
                          src={photoSrc(item.coverUrl, 480)!}
                          srcSet={`${photoSrc(item.coverUrl, 480)} 480w, ${photoSrc(item.coverUrl, 1024)} 1024w`}
                          sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 330px"
                          alt={item.title}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="site-card__placeholder">{item.title.slice(0, 1)}</div>
                      )}
                      {item.area && <span className="site-card__badge">{item.area}</span>}
                    </div>
                    <div className="site-card__body">
                      <h3 className="site-card__title">{item.title}</h3>
                      <p className="site-card__specs">
                        Up to {item.maxGuests} {item.maxGuests === 1 ? 'guest' : 'guests'} ·{' '}
                        {item.bedrooms === 0 ? 'Studio' : `${item.bedrooms} bd`} · {item.bathrooms} ba
                      </p>
                      <div className="site-card__price-row">
                        <div>
                          <span className="site-card__price">{formatMinorKES(item.fromPrice)}</span>
                          <span className="site-card__per"> / night</span>
                        </div>
                        {item.totalPrice && item.nights && (
                          <span className="site-card__total">
                            {formatMinorKES(item.totalPrice)} total ({item.nights}n)
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="site-card__actions">
                    <Link
                      to={`/u/${item.id}${datesQuery}`}
                      className="site-btn site-btn--primary site-btn--sm site-card__book"
                    >
                      Book now
                    </Link>
                    {chat ? (
                      <a
                        href={chat}
                        target="_blank"
                        rel="noreferrer"
                        className="site-btn site-btn--whatsapp site-btn--sm"
                        aria-label={`Ask about ${item.title} on WhatsApp`}
                      >
                        <WhatsAppIcon size={16} /> WhatsApp
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {site.houseRules && (
        <section className="site-section site-rules-box" id="house-rules">
          <h2>House rules</h2>
          <p>{site.houseRules}</p>
        </section>
      )}
    </div>
  );
}
